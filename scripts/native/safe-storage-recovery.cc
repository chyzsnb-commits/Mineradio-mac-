#include <node_api.h>

#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <CommonCrypto/CommonDigest.h>
#include <CommonCrypto/CommonHMAC.h>
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <pwd.h>
#include <signal.h>
#include <sys/file.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <unistd.h>

#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

namespace {

constexpr char kTargetService[] = "Mineradio Safe Storage";
constexpr char kTargetAccount[] = "Mineradio Key";
constexpr char kRecoveryService[] = "Mineradio Safe Storage Migration Recovery";
constexpr char kRecoveryAccount[] = "recovery-v2";
constexpr char kLockDirectorySuffix[] = "/Library/Application Support/Mineradio Migration";
constexpr char kLockFileName[] = "/.safe-storage-handoff.lock";
constexpr size_t kNonceLength = 32;
constexpr size_t kSafeStoragePasswordLength = 24;
constexpr size_t kCdHashLength = 20;
constexpr size_t kSecretDigestLength = CC_SHA256_DIGEST_LENGTH;
constexpr size_t kRecoveryBlobLength = kNonceLength + kSafeStoragePasswordLength + kCdHashLength;
constexpr size_t kFramePayloadLength = kRecoveryBlobLength;
constexpr size_t kFrameWireLength = sizeof(uint32_t) + kFramePayloadLength;
constexpr size_t kCommitProofPayloadLength = 64;
constexpr int kOperationTimeoutMs = 15000;
constexpr unsigned char kCommitProofMagic[8] = {'M', 'R', 'S', 'S', 'P', 'R', 'F', '1'};
constexpr unsigned char kCommitProofVersion = 1;
constexpr unsigned char kCommitProofState = 1;
constexpr char kCommitProofDomain[] = "Mineradio Safe Storage commit proof v1";
constexpr unsigned char kExpectedOldCdHash[kCdHashLength] = {
  0x2f, 0xc3, 0x71, 0x15, 0xa5, 0xc7, 0xfd, 0x7e, 0xb8, 0xc1,
  0x40, 0xcb, 0x32, 0x02, 0x56, 0xa0, 0x6a, 0x50, 0x2f, 0xd4,
};

static_assert(kRecoveryBlobLength == 76, "recovery blob must be nonce32 + secret24 + CDHash20");
static_assert(kFramePayloadLength == 76, "handoff payload must match the recovery blob");

void SecureZero(void* data, size_t length) {
  volatile unsigned char* cursor = static_cast<volatile unsigned char*>(data);
  while (length > 0) {
    *cursor++ = 0;
    --length;
  }
}

bool ConstantTimeEqual(const unsigned char* left, const unsigned char* right, size_t length) {
  unsigned char different = 0;
  for (size_t index = 0; index < length; ++index) different |= left[index] ^ right[index];
  return different == 0;
}

bool HasNonZeroByte(const unsigned char* bytes, size_t length) {
  unsigned char combined = 0;
  for (size_t index = 0; index < length; ++index) combined |= bytes[index];
  return combined != 0;
}

int Base64Value(unsigned char value) {
  if (value >= 'A' && value <= 'Z') return value - 'A';
  if (value >= 'a' && value <= 'z') return value - 'a' + 26;
  if (value >= '0' && value <= '9') return value - '0' + 52;
  if (value == '+') return 62;
  if (value == '/') return 63;
  return -1;
}

bool IsCanonicalSafeStoragePassword(const unsigned char* bytes, size_t length) {
  if (length != kSafeStoragePasswordLength || bytes[length - 2] != '=' || bytes[length - 1] != '=') {
    return false;
  }
  for (size_t index = 0; index < length - 2; ++index) {
    if (Base64Value(bytes[index]) < 0) return false;
  }
  const int finalValue = Base64Value(bytes[length - 3]);
  return finalValue >= 0 && (finalValue & 0x0f) == 0;
}

struct RecoveryBlob {
  unsigned char bytes[kRecoveryBlobLength];

  RecoveryBlob() { std::memset(bytes, 0, sizeof(bytes)); }
  ~RecoveryBlob() { SecureZero(bytes, sizeof(bytes)); }

  unsigned char* nonce() { return bytes; }
  const unsigned char* nonce() const { return bytes; }
  unsigned char* secret() { return bytes + kNonceLength; }
  const unsigned char* secret() const { return bytes + kNonceLength; }
  unsigned char* cdhash() { return bytes + kNonceLength + kSafeStoragePasswordLength; }
  const unsigned char* cdhash() const { return bytes + kNonceLength + kSafeStoragePasswordLength; }
};

napi_value ThrowStatus(napi_env env, const char* operation, OSStatus status) {
  const std::string message = std::string(operation) + " failed with OSStatus " + std::to_string(status);
  if (napi_throw_error(env, nullptr, message.c_str()) != napi_ok) _exit(70);
  return nullptr;
}

napi_value ThrowMessage(napi_env env, const char* message) {
  if (napi_throw_error(env, nullptr, message) != napi_ok) _exit(70);
  return nullptr;
}

bool CheckNapi(napi_env env, napi_status status, const char* operation) {
  if (status == napi_ok) return true;
  const napi_extended_error_info* details = nullptr;
  if (napi_get_last_error_info(env, &details) != napi_ok) details = nullptr;
  const char* detail = details != nullptr && details->error_message != nullptr
    ? details->error_message
    : "unknown N-API error";
  const std::string message = std::string(operation) + ": " + detail;
  if (napi_throw_error(env, nullptr, message.c_str()) != napi_ok) _exit(70);
  return false;
}

OSStatus DisableCoreDumps() {
  rlimit limit{};
  limit.rlim_cur = 0;
  limit.rlim_max = 0;
  return setrlimit(RLIMIT_CORE, &limit) == 0 ? errSecSuccess : errSecIO;
}

void AlarmHandler(int) {
  _exit(124);
}

class OperationDeadline {
 public:
  OSStatus Start() {
    sigset_t unblock;
    if (sigemptyset(&unblock) != 0 || sigaddset(&unblock, SIGALRM) != 0
        || pthread_sigmask(SIG_UNBLOCK, &unblock, &previousMask_) != 0) {
      return errSecIO;
    }
    maskSaved_ = true;

    struct sigaction action{};
    action.sa_handler = AlarmHandler;
    if (sigemptyset(&action.sa_mask) != 0 || sigaction(SIGALRM, &action, &previousAction_) != 0) {
      return errSecIO;
    }
    actionSaved_ = true;

    itimerval timer{};
    timer.it_value.tv_sec = kOperationTimeoutMs / 1000;
    timer.it_value.tv_usec = (kOperationTimeoutMs % 1000) * 1000;
    if (setitimer(ITIMER_REAL, &timer, nullptr) != 0) return errSecIO;
    active_ = true;
    return errSecSuccess;
  }

  ~OperationDeadline() {
    if (active_) {
      itimerval timer{};
      setitimer(ITIMER_REAL, &timer, nullptr);
    }
    if (actionSaved_) sigaction(SIGALRM, &previousAction_, nullptr);
    if (maskSaved_) pthread_sigmask(SIG_SETMASK, &previousMask_, nullptr);
  }

 private:
  sigset_t previousMask_{};
  struct sigaction previousAction_{};
  bool maskSaved_ = false;
  bool actionSaved_ = false;
  bool active_ = false;
};

class InteractionGuard {
 public:
  OSStatus Disable() {
    OSStatus status = SecKeychainGetUserInteractionAllowed(&previous_);
    if (status != errSecSuccess) return status;
    status = SecKeychainSetUserInteractionAllowed(false);
    if (status == errSecSuccess) active_ = true;
    return status;
  }

  ~InteractionGuard() {
    if (active_) SecKeychainSetUserInteractionAllowed(previous_);
  }

 private:
  Boolean previous_ = true;
  bool active_ = false;
};

int64_t MonotonicMilliseconds() {
  timespec now{};
  if (clock_gettime(CLOCK_MONOTONIC, &now) != 0) return -1;
  return static_cast<int64_t>(now.tv_sec) * 1000 + now.tv_nsec / 1000000;
}

class MigrationLock {
 public:
  OSStatus Acquire() {
    passwd passwordEntry{};
    passwd* passwordResult = nullptr;
    char passwordBuffer[16384];
    if (getpwuid_r(getuid(), &passwordEntry, passwordBuffer, sizeof(passwordBuffer), &passwordResult) != 0
        || passwordResult == nullptr || passwordEntry.pw_dir == nullptr) {
      return errSecIO;
    }
    const std::string lockDirectory = std::string(passwordEntry.pw_dir) + kLockDirectorySuffix;
    if (mkdir(lockDirectory.c_str(), 0700) != 0 && errno != EEXIST) return errSecIO;
    struct stat directoryStat{};
    if (lstat(lockDirectory.c_str(), &directoryStat) != 0 || !S_ISDIR(directoryStat.st_mode)
        || S_ISLNK(directoryStat.st_mode) || directoryStat.st_uid != getuid()
        || (directoryStat.st_mode & 0077) != 0) {
      return errSecAuthFailed;
    }

    const std::string lockPath = lockDirectory + kLockFileName;
    fd_ = open(lockPath.c_str(), O_RDWR | O_CREAT | O_CLOEXEC | O_NOFOLLOW, 0600);
    if (fd_ < 0) return errSecIO;
    struct stat lockStat{};
    if (fstat(fd_, &lockStat) != 0 || !S_ISREG(lockStat.st_mode)
        || lockStat.st_uid != getuid() || lockStat.st_nlink != 1
        || (lockStat.st_mode & 0077) != 0) {
      return errSecAuthFailed;
    }

    const int64_t start = MonotonicMilliseconds();
    if (start < 0) return errSecIO;
    const int64_t deadline = start + kOperationTimeoutMs;
    while (true) {
      if (flock(fd_, LOCK_EX | LOCK_NB) == 0) {
        locked_ = true;
        return errSecSuccess;
      }
      if (errno != EWOULDBLOCK && errno != EAGAIN && errno != EINTR) return errSecIO;
      const int64_t now = MonotonicMilliseconds();
      if (now < 0 || now >= deadline) return errSecInteractionNotAllowed;
      timespec pause{0, 50 * 1000 * 1000};
      nanosleep(&pause, nullptr);
    }
  }

  ~MigrationLock() {
    if (fd_ >= 0) {
      if (locked_) flock(fd_, LOCK_UN);
      close(fd_);
    }
  }

 private:
  int fd_ = -1;
  bool locked_ = false;
};

OSStatus VerifyOldRuntimeIdentity() {
  SecCodeRef code = nullptr;
  CFDictionaryRef information = nullptr;
  OSStatus status = SecCodeCopySelf(kSecCSDefaultFlags, &code);
  if (status == errSecSuccess) status = SecCodeCheckValidity(code, kSecCSStrictValidate, nullptr);
  if (status == errSecSuccess) {
    status = SecCodeCopySigningInformation(code, kSecCSSigningInformation, &information);
  }
  if (status == errSecSuccess) {
    CFTypeRef identifier = CFDictionaryGetValue(information, kSecCodeInfoIdentifier);
    CFTypeRef unique = CFDictionaryGetValue(information, kSecCodeInfoUnique);
    if (identifier == nullptr || CFGetTypeID(identifier) != CFStringGetTypeID()
        || CFStringCompare(static_cast<CFStringRef>(identifier), CFSTR("com.mineradio.desktop"), 0)
             != kCFCompareEqualTo
        || unique == nullptr || CFGetTypeID(unique) != CFDataGetTypeID()
        || CFDataGetLength(static_cast<CFDataRef>(unique)) != kCdHashLength
        || !ConstantTimeEqual(
             CFDataGetBytePtr(static_cast<CFDataRef>(unique)), kExpectedOldCdHash, kCdHashLength)) {
      status = errSecCSReqFailed;
    }
  }
  if (information != nullptr) CFRelease(information);
  if (code != nullptr) CFRelease(code);
  return status;
}

class KeychainUniverse {
 public:
  OSStatus Load(SecKeychainRef defaultKeychain) {
    CFArrayRef searchList = nullptr;
    OSStatus status = SecKeychainCopySearchList(&searchList);
    if (status != errSecSuccess || searchList == nullptr) return status == errSecSuccess ? errSecIO : status;
    const CFIndex count = CFArrayGetCount(searchList);
    for (CFIndex index = 0; index < count; ++index) {
      CFTypeRef value = CFArrayGetValueAtIndex(searchList, index);
      if (value == nullptr || CFGetTypeID(value) != SecKeychainGetTypeID()) {
        CFRelease(searchList);
        return errSecInvalidKeychain;
      }
      AddUnique(static_cast<SecKeychainRef>(const_cast<void*>(value)));
    }
    CFRelease(searchList);
    AddUnique(defaultKeychain);
    return keychains_.empty() ? errSecInvalidKeychain : errSecSuccess;
  }

  ~KeychainUniverse() {
    for (SecKeychainRef keychain : keychains_) CFRelease(keychain);
  }

  const std::vector<SecKeychainRef>& keychains() const { return keychains_; }

 private:
  void AddUnique(SecKeychainRef candidate) {
    for (SecKeychainRef existing : keychains_) {
      if (CFEqual(existing, candidate)) return;
    }
    CFRetain(candidate);
    keychains_.push_back(candidate);
  }

  std::vector<SecKeychainRef> keychains_;
};

bool ItemBelongsToKeychain(SecKeychainItemRef item, SecKeychainRef expected, OSStatus* outputStatus) {
  SecKeychainRef actual = nullptr;
  OSStatus status = SecKeychainItemCopyKeychain(item, &actual);
  if (status != errSecSuccess || actual == nullptr) {
    *outputStatus = status == errSecSuccess ? errSecInvalidKeychain : status;
    return false;
  }
  const bool matches = CFEqual(actual, expected);
  CFRelease(actual);
  *outputStatus = matches ? errSecSuccess : errSecInvalidKeychain;
  return matches;
}

SecKeychainItemRef FindUniqueItem(
    SecKeychainRef defaultKeychain,
    const char* service,
    const char* account,
    bool allowMissing,
    OSStatus* outputStatus) {
  KeychainUniverse universe;
  OSStatus status = universe.Load(defaultKeychain);
  if (status != errSecSuccess) {
    *outputStatus = status;
    return nullptr;
  }

  SecKeychainAttribute attributes[] = {
    {kSecServiceItemAttr, static_cast<UInt32>(std::strlen(service)), const_cast<char*>(service)},
    {kSecAccountItemAttr, static_cast<UInt32>(std::strlen(account)), const_cast<char*>(account)},
  };
  SecKeychainAttributeList attributeList = {2, attributes};
  SecKeychainItemRef match = nullptr;
  size_t count = 0;

  for (SecKeychainRef keychain : universe.keychains()) {
    SecKeychainSearchRef search = nullptr;
    status = SecKeychainSearchCreateFromAttributes(
        keychain, kSecGenericPasswordItemClass, &attributeList, &search);
    if (status != errSecSuccess || search == nullptr) {
      if (match != nullptr) CFRelease(match);
      *outputStatus = status == errSecSuccess ? errSecIO : status;
      return nullptr;
    }
    while (true) {
      SecKeychainItemRef item = nullptr;
      status = SecKeychainSearchCopyNext(search, &item);
      if (status == errSecItemNotFound) break;
      if (status != errSecSuccess || item == nullptr) {
        if (item != nullptr) CFRelease(item);
        CFRelease(search);
        if (match != nullptr) CFRelease(match);
        *outputStatus = status == errSecSuccess ? errSecIO : status;
        return nullptr;
      }
      ++count;
      if (count == 1) match = item;
      else CFRelease(item);
    }
    CFRelease(search);
  }

  if (count > 1) {
    if (match != nullptr) CFRelease(match);
    *outputStatus = errSecDuplicateItem;
    return nullptr;
  }
  if (count == 0) {
    *outputStatus = allowMissing ? errSecSuccess : errSecItemNotFound;
    return nullptr;
  }
  if (!ItemBelongsToKeychain(match, defaultKeychain, outputStatus)) {
    CFRelease(match);
    return nullptr;
  }
  *outputStatus = errSecSuccess;
  return match;
}

OSStatus ReadPassword(SecKeychainItemRef item, unsigned char* output, size_t expectedLength) {
  UInt32 length = 0;
  void* bytes = nullptr;
  OSStatus status = SecKeychainItemCopyContent(item, nullptr, nullptr, &length, &bytes);
  if (status != errSecSuccess) return status;
  if (bytes == nullptr || length != expectedLength) {
    if (bytes != nullptr) {
      SecureZero(bytes, length);
      SecKeychainItemFreeContent(nullptr, bytes);
    }
    return errSecDecode;
  }
  std::memcpy(output, bytes, length);
  SecureZero(bytes, length);
  status = SecKeychainItemFreeContent(nullptr, bytes);
  return status;
}

OSStatus ReadTarget(SecKeychainItemRef item, unsigned char output[kSafeStoragePasswordLength]) {
  OSStatus status = ReadPassword(item, output, kSafeStoragePasswordLength);
  if (status == errSecSuccess && !IsCanonicalSafeStoragePassword(output, kSafeStoragePasswordLength)) {
    status = errSecDecode;
  }
  return status;
}

OSStatus ReadRecovery(SecKeychainItemRef item, RecoveryBlob* output) {
  OSStatus status = ReadPassword(item, output->bytes, sizeof(output->bytes));
  if (status == errSecSuccess && (!HasNonZeroByte(output->nonce(), kNonceLength)
      || !IsCanonicalSafeStoragePassword(output->secret(), kSafeStoragePasswordLength)
      || !HasNonZeroByte(output->cdhash(), kCdHashLength)
      || ConstantTimeEqual(output->cdhash(), kExpectedOldCdHash, kCdHashLength))) {
    status = errSecDecode;
  }
  return status;
}

OSStatus AddPassword(
    SecKeychainRef keychain,
    const char* service,
    const char* account,
    const unsigned char* bytes,
    size_t length,
    SecKeychainItemRef* outputItem) {
  if (length > UINT32_MAX) return errSecParam;
  return SecKeychainAddGenericPassword(
      keychain,
      static_cast<UInt32>(std::strlen(service)), service,
      static_cast<UInt32>(std::strlen(account)), account,
      static_cast<UInt32>(length), bytes,
      outputItem);
}

OSStatus CompareTargetWithRecovery(SecKeychainItemRef target, const RecoveryBlob& recovery) {
  unsigned char secret[kSafeStoragePasswordLength];
  std::memset(secret, 0, sizeof(secret));
  OSStatus status = ReadTarget(target, secret);
  if (status == errSecSuccess
      && !ConstantTimeEqual(secret, recovery.secret(), sizeof(secret))) {
    status = errSecVerifyFailed;
  }
  SecureZero(secret, sizeof(secret));
  return status;
}

OSStatus Prepare(
    SecKeychainRef keychain,
    const unsigned char newCdHash[kCdHashLength]) {
  OSStatus status = errSecSuccess;
  SecKeychainItemRef target = FindUniqueItem(
      keychain, kTargetService, kTargetAccount, true, &status);
  if (status != errSecSuccess) return status;
  SecKeychainItemRef recovery = FindUniqueItem(
      keychain, kRecoveryService, kRecoveryAccount, true, &status);
  if (status != errSecSuccess) {
    if (target != nullptr) CFRelease(target);
    return status;
  }

  RecoveryBlob expected;
  if (recovery != nullptr) {
    status = ReadRecovery(recovery, &expected);
    if (status == errSecSuccess
        && !ConstantTimeEqual(expected.cdhash(), newCdHash, kCdHashLength)) {
      status = errSecVerifyFailed;
    }
    if (status == errSecSuccess && target != nullptr) {
      status = CompareTargetWithRecovery(target, expected);
    }
  } else if (target == nullptr) {
    status = errSecItemNotFound;
  } else {
    status = ReadTarget(target, expected.secret());
    if (status == errSecSuccess) {
      std::memcpy(expected.cdhash(), newCdHash, kCdHashLength);
    }
    if (status == errSecSuccess) {
      status = SecRandomCopyBytes(kSecRandomDefault, kNonceLength, expected.nonce());
    }
    if (status == errSecSuccess && !HasNonZeroByte(expected.nonce(), kNonceLength)) {
      status = errSecDecode;
    }
    if (status == errSecSuccess) {
      SecKeychainItemRef added = nullptr;
      status = AddPassword(
          keychain, kRecoveryService, kRecoveryAccount,
          expected.bytes, sizeof(expected.bytes), &added);
      if (added != nullptr) CFRelease(added);
    }
    if (status == errSecSuccess) {
      recovery = FindUniqueItem(
          keychain, kRecoveryService, kRecoveryAccount, false, &status);
      if (status == errSecSuccess && recovery != nullptr) {
        RecoveryBlob readback;
        status = ReadRecovery(recovery, &readback);
        if (status == errSecSuccess
            && !ConstantTimeEqual(readback.bytes, expected.bytes, sizeof(expected.bytes))) {
          status = errSecVerifyFailed;
        }
      }
    }
  }

  if (target != nullptr) CFRelease(target);
  if (recovery != nullptr) CFRelease(recovery);
  return status;
}

OSStatus DeleteTargetIfMatchesRecovery(SecKeychainRef keychain) {
  OSStatus status = errSecSuccess;
  SecKeychainItemRef recovery = FindUniqueItem(
      keychain, kRecoveryService, kRecoveryAccount, false, &status);
  if (status != errSecSuccess || recovery == nullptr) return status;
  RecoveryBlob expected;
  status = ReadRecovery(recovery, &expected);

  SecKeychainItemRef target = nullptr;
  if (status == errSecSuccess) {
    target = FindUniqueItem(keychain, kTargetService, kTargetAccount, true, &status);
  }
  if (status == errSecSuccess && target != nullptr) {
    status = CompareTargetWithRecovery(target, expected);
    if (status == errSecSuccess) status = SecKeychainItemDelete(target);
  }

  if (status == errSecSuccess) {
    SecKeychainItemRef remaining = FindUniqueItem(
        keychain, kTargetService, kTargetAccount, true, &status);
    if (status == errSecSuccess && remaining != nullptr) status = errSecDuplicateItem;
    if (remaining != nullptr) CFRelease(remaining);
  }
  if (status == errSecSuccess) {
    RecoveryBlob readback;
    SecKeychainItemRef remainingRecovery = FindUniqueItem(
        keychain, kRecoveryService, kRecoveryAccount, false, &status);
    if (status == errSecSuccess && remainingRecovery != nullptr) {
      status = ReadRecovery(remainingRecovery, &readback);
      if (status == errSecSuccess
          && !ConstantTimeEqual(readback.bytes, expected.bytes, sizeof(expected.bytes))) {
        status = errSecVerifyFailed;
      }
    }
    if (remainingRecovery != nullptr) CFRelease(remainingRecovery);
  }

  if (target != nullptr) CFRelease(target);
  CFRelease(recovery);
  return status;
}

OSStatus RestoreTargetIfAbsent(SecKeychainRef keychain) {
  OSStatus status = errSecSuccess;
  SecKeychainItemRef recovery = FindUniqueItem(
      keychain, kRecoveryService, kRecoveryAccount, false, &status);
  if (status != errSecSuccess || recovery == nullptr) return status;
  RecoveryBlob expected;
  status = ReadRecovery(recovery, &expected);

  SecKeychainItemRef target = nullptr;
  if (status == errSecSuccess) {
    target = FindUniqueItem(keychain, kTargetService, kTargetAccount, true, &status);
  }
  if (status == errSecSuccess && target == nullptr) {
    SecKeychainItemRef added = nullptr;
    status = AddPassword(
        keychain, kTargetService, kTargetAccount,
        expected.secret(), kSafeStoragePasswordLength, &added);
    if (added != nullptr) CFRelease(added);
    if (status == errSecDuplicateItem) status = errSecSuccess;
    if (status == errSecSuccess) {
      target = FindUniqueItem(keychain, kTargetService, kTargetAccount, false, &status);
    }
  }
  if (status == errSecSuccess && target != nullptr) {
    status = CompareTargetWithRecovery(target, expected);
  }

  if (target != nullptr) CFRelease(target);
  CFRelease(recovery);
  return status;
}

OSStatus CleanupRecoveryIfTargetMatches(SecKeychainRef keychain) {
  OSStatus status = errSecSuccess;
  SecKeychainItemRef target = FindUniqueItem(
      keychain, kTargetService, kTargetAccount, false, &status);
  if (status != errSecSuccess || target == nullptr) return status;
  SecKeychainItemRef recovery = FindUniqueItem(
      keychain, kRecoveryService, kRecoveryAccount, true, &status);
  if (status != errSecSuccess) {
    CFRelease(target);
    return status;
  }

  if (recovery == nullptr) {
    unsigned char secret[kSafeStoragePasswordLength];
    std::memset(secret, 0, sizeof(secret));
    status = ReadTarget(target, secret);
    SecureZero(secret, sizeof(secret));
  } else {
    RecoveryBlob expected;
    status = ReadRecovery(recovery, &expected);
    if (status == errSecSuccess) status = CompareTargetWithRecovery(target, expected);
    if (status == errSecSuccess) status = SecKeychainItemDelete(recovery);
    if (status == errSecSuccess) {
      SecKeychainItemRef remaining = FindUniqueItem(
          keychain, kRecoveryService, kRecoveryAccount, true, &status);
      if (status == errSecSuccess && remaining != nullptr) status = errSecDuplicateItem;
      if (remaining != nullptr) CFRelease(remaining);
    }
    if (status == errSecSuccess) status = CompareTargetWithRecovery(target, expected);
  }

  if (recovery != nullptr) CFRelease(recovery);
  CFRelease(target);
  return status;
}

bool DecodeCdHash(napi_env env, napi_value value, unsigned char output[kCdHashLength]) {
  napi_valuetype type = napi_undefined;
  if (!CheckNapi(env, napi_typeof(env, value, &type), "read new CDHash argument type")) return false;
  if (type != napi_string) {
    ThrowMessage(env, "new CDHash must be an exact 40-character hexadecimal string");
    return false;
  }
  size_t length = 0;
  if (!CheckNapi(env, napi_get_value_string_utf8(env, value, nullptr, 0, &length), "measure new CDHash")) {
    return false;
  }
  if (length != kCdHashLength * 2) {
    ThrowMessage(env, "new CDHash must be an exact 40-character hexadecimal string");
    return false;
  }
  char encoded[kCdHashLength * 2 + 1];
  std::memset(encoded, 0, sizeof(encoded));
  size_t written = 0;
  if (!CheckNapi(env, napi_get_value_string_utf8(
          env, value, encoded, sizeof(encoded), &written), "read new CDHash")) {
    SecureZero(encoded, sizeof(encoded));
    return false;
  }
  if (written != length || encoded[length] != '\0') {
    SecureZero(encoded, sizeof(encoded));
    ThrowMessage(env, "new CDHash encoding is invalid");
    return false;
  }
  for (size_t index = 0; index < kCdHashLength; ++index) {
    const auto hexValue = [](char character) -> int {
      if (character >= '0' && character <= '9') return character - '0';
      if (character >= 'a' && character <= 'f') return character - 'a' + 10;
      if (character >= 'A' && character <= 'F') return character - 'A' + 10;
      return -1;
    };
    const int high = hexValue(encoded[index * 2]);
    const int low = hexValue(encoded[index * 2 + 1]);
    if (high < 0 || low < 0) {
      SecureZero(encoded, sizeof(encoded));
      SecureZero(output, kCdHashLength);
      ThrowMessage(env, "new CDHash must contain hexadecimal characters only");
      return false;
    }
    output[index] = static_cast<unsigned char>((high << 4) | low);
  }
  SecureZero(encoded, sizeof(encoded));
  if (!HasNonZeroByte(output, kCdHashLength)
      || ConstantTimeEqual(output, kExpectedOldCdHash, kCdHashLength)) {
    SecureZero(output, kCdHashLength);
    ThrowMessage(env, "new CDHash must identify a different non-zero signing identity");
    return false;
  }
  return true;
}

OSStatus ValidateOutputFd(int fd) {
  if (fd != 3) return errSecParam;
  struct stat descriptorStat{};
  if (fstat(fd, &descriptorStat) != 0
      || !(S_ISFIFO(descriptorStat.st_mode) || S_ISSOCK(descriptorStat.st_mode))) {
    return errSecParam;
  }
  const int descriptorFlags = fcntl(fd, F_GETFL);
  if (descriptorFlags < 0) return errSecIO;
  const int accessMode = descriptorFlags & O_ACCMODE;
  if (accessMode != O_WRONLY && accessMode != O_RDWR) return errSecParam;
  const int closeFlags = fcntl(fd, F_GETFD);
  if (closeFlags < 0 || fcntl(fd, F_SETFD, closeFlags | FD_CLOEXEC) != 0) return errSecIO;
  return errSecSuccess;
}

OSStatus ValidateInputFd(int fd) {
  if (fd != 3) return errSecParam;
  struct stat descriptorStat{};
  if (fstat(fd, &descriptorStat) != 0
      || !(S_ISFIFO(descriptorStat.st_mode) || S_ISSOCK(descriptorStat.st_mode))) {
    return errSecParam;
  }
  const int descriptorFlags = fcntl(fd, F_GETFL);
  if (descriptorFlags < 0 || (descriptorFlags & O_ACCMODE) != O_RDONLY) return errSecParam;
  const int closeFlags = fcntl(fd, F_GETFD);
  if (closeFlags < 0 || fcntl(fd, F_SETFD, closeFlags | FD_CLOEXEC) != 0) return errSecIO;
  return errSecSuccess;
}

bool WaitReadable(int fd, int64_t deadline) {
  while (true) {
    const int64_t now = MonotonicMilliseconds();
    if (now < 0 || now >= deadline) return false;
    pollfd descriptor{fd, POLLIN | POLLHUP, 0};
    const int waitMilliseconds = static_cast<int>(deadline - now);
    const int result = poll(&descriptor, 1, waitMilliseconds);
    if (result > 0) return (descriptor.revents & (POLLIN | POLLHUP)) != 0;
    if (result == 0) return false;
    if (errno != EINTR) return false;
  }
}

bool ReadExact(int fd, unsigned char* output, size_t length, int64_t deadline) {
  size_t offset = 0;
  while (offset < length) {
    if (!WaitReadable(fd, deadline)) return false;
    const ssize_t bytes = read(fd, output + offset, length - offset);
    if (bytes > 0) {
      offset += static_cast<size_t>(bytes);
      continue;
    }
    if (bytes < 0 && errno == EINTR) continue;
    return false;
  }
  return true;
}

OSStatus ReadCommitProof(int fd, unsigned char proof[kCommitProofPayloadLength]) {
  OSStatus status = ValidateInputFd(fd);
  if (status != errSecSuccess) return status;
  const int64_t start = MonotonicMilliseconds();
  if (start < 0) return errSecIO;
  const int64_t deadline = start + kOperationTimeoutMs;
  uint32_t encodedLength = 0;
  if (!ReadExact(fd, reinterpret_cast<unsigned char*>(&encodedLength), sizeof(encodedLength), deadline)) {
    return errSecIO;
  }
  if (ntohl(encodedLength) != kCommitProofPayloadLength
      || !ReadExact(fd, proof, kCommitProofPayloadLength, deadline)) {
    return errSecDecode;
  }
  unsigned char trailing = 0;
  while (true) {
    if (!WaitReadable(fd, deadline)) return errSecIO;
    const ssize_t bytes = read(fd, &trailing, 1);
    if (bytes == 0) break;
    if (bytes < 0 && errno == EINTR) continue;
    return errSecDecode;
  }
  if (!ConstantTimeEqual(proof, kCommitProofMagic, sizeof(kCommitProofMagic))
      || proof[8] != kCommitProofVersion || proof[9] != kCommitProofState
      || proof[10] != 0 || proof[11] != 0
      || !HasNonZeroByte(proof + 12, kCdHashLength)
      || ConstantTimeEqual(proof + 12, kExpectedOldCdHash, kCdHashLength)) {
    return errSecDecode;
  }
  return errSecSuccess;
}

bool WaitWritable(int fd, int64_t deadline) {
  while (true) {
    const int64_t now = MonotonicMilliseconds();
    if (now < 0 || now >= deadline) return false;
    pollfd descriptor{fd, POLLOUT, 0};
    const int waitMilliseconds = static_cast<int>(deadline - now);
    const int result = poll(&descriptor, 1, waitMilliseconds);
    if (result > 0) {
      if ((descriptor.revents & (POLLERR | POLLHUP | POLLNVAL)) != 0) return false;
      return (descriptor.revents & POLLOUT) != 0;
    }
    if (result == 0) return false;
    if (errno != EINTR) return false;
  }
}

OSStatus WriteExact(int fd, const unsigned char* bytes, size_t length) {
  struct sigaction ignorePipe{};
  struct sigaction previousPipe{};
  ignorePipe.sa_handler = SIG_IGN;
  if (sigemptyset(&ignorePipe.sa_mask) != 0 || sigaction(SIGPIPE, &ignorePipe, &previousPipe) != 0) {
    return errSecIO;
  }
  const int64_t start = MonotonicMilliseconds();
  if (start < 0) {
    sigaction(SIGPIPE, &previousPipe, nullptr);
    return errSecIO;
  }
  const int64_t deadline = start + kOperationTimeoutMs;
  size_t offset = 0;
  OSStatus status = errSecSuccess;
  while (offset < length) {
    if (!WaitWritable(fd, deadline)) {
      status = errSecIO;
      break;
    }
    const ssize_t written = write(fd, bytes + offset, length - offset);
    if (written > 0) {
      offset += static_cast<size_t>(written);
      continue;
    }
    if (written < 0 && errno == EINTR) continue;
    status = errSecIO;
    break;
  }
  if (sigaction(SIGPIPE, &previousPipe, nullptr) != 0 && status == errSecSuccess) status = errSecIO;
  return status;
}

OSStatus ExportFrame(SecKeychainRef keychain, int fd) {
  OSStatus status = ValidateOutputFd(fd);
  if (status != errSecSuccess) return status;
  SecKeychainItemRef recovery = FindUniqueItem(
      keychain, kRecoveryService, kRecoveryAccount, false, &status);
  if (status != errSecSuccess || recovery == nullptr) return status;
  RecoveryBlob expected;
  status = ReadRecovery(recovery, &expected);

  unsigned char wire[kFrameWireLength];
  std::memset(wire, 0, sizeof(wire));
  if (status == errSecSuccess) {
    const uint32_t encodedLength = htonl(static_cast<uint32_t>(kFramePayloadLength));
    std::memcpy(wire, &encodedLength, sizeof(encodedLength));
    std::memcpy(wire + sizeof(encodedLength), expected.bytes, sizeof(expected.bytes));
    status = WriteExact(fd, wire, sizeof(wire));
  }
  SecureZero(wire, sizeof(wire));

  CFRelease(recovery);
  return status;
}

void BuildExpectedCommitProof(
    const RecoveryBlob& recovery,
    unsigned char proof[kCommitProofPayloadLength]) {
  unsigned char digest[kSecretDigestLength];
  unsigned char marker[kNonceLength + kCdHashLength + kSecretDigestLength];
  unsigned char message[sizeof(kCommitProofDomain) + sizeof(marker) + 1];
  std::memset(digest, 0, sizeof(digest));
  std::memset(marker, 0, sizeof(marker));
  std::memset(message, 0, sizeof(message));
  std::memset(proof, 0, kCommitProofPayloadLength);

  CC_SHA256(
      recovery.secret(),
      static_cast<CC_LONG>(kSafeStoragePasswordLength),
      digest);
  std::memcpy(marker, recovery.nonce(), kNonceLength);
  std::memcpy(marker + kNonceLength, recovery.cdhash(), kCdHashLength);
  std::memcpy(marker + kNonceLength + kCdHashLength, digest, sizeof(digest));
  std::memcpy(message, kCommitProofDomain, sizeof(kCommitProofDomain));
  std::memcpy(message + sizeof(kCommitProofDomain), marker, sizeof(marker));
  message[sizeof(kCommitProofDomain) + sizeof(marker)] = kCommitProofState;

  std::memcpy(proof, kCommitProofMagic, sizeof(kCommitProofMagic));
  proof[8] = kCommitProofVersion;
  proof[9] = kCommitProofState;
  std::memcpy(proof + 12, recovery.cdhash(), kCdHashLength);
  CCHmac(
      kCCHmacAlgSHA256,
      recovery.secret(),
      kSafeStoragePasswordLength,
      message,
      sizeof(message),
      proof + 32);

  SecureZero(message, sizeof(message));
  SecureZero(marker, sizeof(marker));
  SecureZero(digest, sizeof(digest));
}

OSStatus CleanupRecoveryWithCommitProof(
    SecKeychainRef keychain,
    const unsigned char proof[kCommitProofPayloadLength]) {
  OSStatus status = errSecSuccess;
  SecKeychainItemRef recovery = FindUniqueItem(
      keychain, kRecoveryService, kRecoveryAccount, true, &status);
  if (status != errSecSuccess || recovery == nullptr) return status;

  RecoveryBlob expected;
  unsigned char expectedProof[kCommitProofPayloadLength];
  std::memset(expectedProof, 0, sizeof(expectedProof));
  status = ReadRecovery(recovery, &expected);
  if (status == errSecSuccess) {
    BuildExpectedCommitProof(expected, expectedProof);
    if (!ConstantTimeEqual(expectedProof, proof, sizeof(expectedProof))) status = errSecVerifyFailed;
  }
  if (status == errSecSuccess) status = SecKeychainItemDelete(recovery);
  if (status == errSecSuccess) {
    SecKeychainItemRef remaining = FindUniqueItem(
        keychain, kRecoveryService, kRecoveryAccount, true, &status);
    if (status == errSecSuccess && remaining != nullptr) status = errSecDuplicateItem;
    if (remaining != nullptr) CFRelease(remaining);
  }
  SecureZero(expectedProof, sizeof(expectedProof));
  CFRelease(recovery);
  return status;
}

napi_value StateObject(napi_env env, SecKeychainRef keychain) {
  OSStatus status = errSecSuccess;
  SecKeychainItemRef target = FindUniqueItem(
      keychain, kTargetService, kTargetAccount, true, &status);
  if (status != errSecSuccess) return ThrowStatus(env, "query target state", status);
  SecKeychainItemRef recovery = FindUniqueItem(
      keychain, kRecoveryService, kRecoveryAccount, true, &status);
  if (status != errSecSuccess) {
    if (target != nullptr) CFRelease(target);
    return ThrowStatus(env, "query recovery state", status);
  }

  napi_value result = nullptr;
  napi_value value = nullptr;
  if (!CheckNapi(env, napi_create_object(env, &result), "create recovery state")
      || !CheckNapi(env, napi_get_boolean(env, true, &value), "create ok value")
      || !CheckNapi(env, napi_set_named_property(env, result, "ok", value), "set ok value")
      || !CheckNapi(env, napi_get_boolean(env, target != nullptr, &value), "create target value")
      || !CheckNapi(env, napi_set_named_property(env, result, "target", value), "set target value")
      || !CheckNapi(env, napi_get_boolean(env, recovery != nullptr, &value), "create recovery value")
      || !CheckNapi(env, napi_set_named_property(env, result, "recovery", value), "set recovery value")) {
    result = nullptr;
  }
  if (target != nullptr) CFRelease(target);
  if (recovery != nullptr) CFRelease(recovery);
  return result;
}

napi_value RecoveryOnlyStateObject(napi_env env, SecKeychainRef keychain) {
  OSStatus status = errSecSuccess;
  SecKeychainItemRef recovery = FindUniqueItem(
      keychain, kRecoveryService, kRecoveryAccount, true, &status);
  if (status != errSecSuccess) return ThrowStatus(env, "query recovery state", status);
  napi_value result = nullptr;
  napi_value value = nullptr;
  if (!CheckNapi(env, napi_create_object(env, &result), "create recovery-only state")
      || !CheckNapi(env, napi_get_boolean(env, true, &value), "create ok value")
      || !CheckNapi(env, napi_set_named_property(env, result, "ok", value), "set ok value")
      || !CheckNapi(env, napi_get_boolean(env, recovery != nullptr, &value), "create recovery value")
      || !CheckNapi(env, napi_set_named_property(
          env, result, "recovery", value), "set recovery value")) {
    result = nullptr;
  }
  if (recovery != nullptr) CFRelease(recovery);
  return result;
}

enum class Operation {
  kPrepare,
  kExport,
  kDeleteTarget,
  kRestoreTarget,
  kCleanupRecovery,
  kCleanupRecoveryFromProof,
  kStateRecovery,
};

napi_value RunOperation(napi_env env, napi_callback_info info, Operation operation) {
  size_t argc = 3;
  napi_value argv[3] = {nullptr, nullptr, nullptr};
  if (!CheckNapi(env, napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr), "read recovery arguments")) {
    return nullptr;
  }

  int32_t fd = -1;
  unsigned char newCdHash[kCdHashLength];
  unsigned char commitProof[kCommitProofPayloadLength];
  std::memset(newCdHash, 0, sizeof(newCdHash));
  std::memset(commitProof, 0, sizeof(commitProof));
  if (operation == Operation::kPrepare) {
    if (argc != 1) return ThrowMessage(env, "prepare accepts exactly one new CDHash");
    if (!DecodeCdHash(env, argv[0], newCdHash)) return nullptr;
  } else if (operation == Operation::kExport
      || operation == Operation::kCleanupRecoveryFromProof) {
    if (argc != 1) return ThrowMessage(env, "binary recovery operation accepts exactly fd 3");
    if (!CheckNapi(env, napi_get_value_int32(env, argv[0], &fd), "read export fd")) return nullptr;
    if (fd != 3) return ThrowMessage(env, "binary recovery operation requires inherited pipe fd 3");
  } else if (argc != 0) {
    return ThrowMessage(env, "recovery operation accepts no arguments");
  }

  OSStatus status = DisableCoreDumps();
  if (status != errSecSuccess) {
    SecureZero(newCdHash, sizeof(newCdHash));
    return ThrowStatus(env, "disable core dumps", status);
  }
  OperationDeadline deadline;
  status = deadline.Start();
  if (status != errSecSuccess) {
    SecureZero(newCdHash, sizeof(newCdHash));
    return ThrowStatus(env, "arm native operation timeout", status);
  }
  status = VerifyOldRuntimeIdentity();
  if (status != errSecSuccess) {
    SecureZero(newCdHash, sizeof(newCdHash));
    SecureZero(commitProof, sizeof(commitProof));
    return ThrowStatus(env, "verify fixed old Mineradio signing identity", status);
  }
  if (operation == Operation::kCleanupRecoveryFromProof) {
    status = ReadCommitProof(fd, commitProof);
    const int closeResult = close(fd);
    fd = -1;
    if (closeResult != 0 && status == errSecSuccess) status = errSecIO;
    if (status != errSecSuccess) {
      SecureZero(newCdHash, sizeof(newCdHash));
      SecureZero(commitProof, sizeof(commitProof));
      return ThrowStatus(env, "read committed Safe Storage proof", status);
    }
  }

  MigrationLock migrationLock;
  status = migrationLock.Acquire();
  if (status != errSecSuccess) {
    SecureZero(newCdHash, sizeof(newCdHash));
    return ThrowStatus(env, "acquire Safe Storage migration lock", status);
  }
  InteractionGuard interaction;
  status = interaction.Disable();
  if (status != errSecSuccess) {
    SecureZero(newCdHash, sizeof(newCdHash));
    return ThrowStatus(env, "disable Keychain interaction", status);
  }
  SecKeychainRef keychain = nullptr;
  status = SecKeychainCopyDefault(&keychain);
  if (status != errSecSuccess || keychain == nullptr) {
    SecureZero(newCdHash, sizeof(newCdHash));
    return ThrowStatus(env, "open default keychain", status == errSecSuccess ? errSecInvalidKeychain : status);
  }

  if (operation == Operation::kPrepare) status = Prepare(keychain, newCdHash);
  else if (operation == Operation::kExport) status = ExportFrame(keychain, fd);
  else if (operation == Operation::kDeleteTarget) status = DeleteTargetIfMatchesRecovery(keychain);
  else if (operation == Operation::kRestoreTarget) status = RestoreTargetIfAbsent(keychain);
  else if (operation == Operation::kCleanupRecovery) status = CleanupRecoveryIfTargetMatches(keychain);
  else if (operation == Operation::kCleanupRecoveryFromProof) {
    status = CleanupRecoveryWithCommitProof(keychain, commitProof);
  }
  if (operation == Operation::kExport) {
    const int closeResult = close(fd);
    fd = -1;
    if (closeResult != 0 && status == errSecSuccess) status = errSecIO;
  }
  SecureZero(newCdHash, sizeof(newCdHash));
  SecureZero(commitProof, sizeof(commitProof));

  napi_value result = nullptr;
  if (status == errSecSuccess) {
    result = (operation == Operation::kCleanupRecoveryFromProof
          || operation == Operation::kStateRecovery)
      ? RecoveryOnlyStateObject(env, keychain)
      : StateObject(env, keychain);
  }
  CFRelease(keychain);
  if (status != errSecSuccess) return ThrowStatus(env, "apply Safe Storage recovery operation", status);
  return result;
}

napi_value PrepareForMigration(napi_env env, napi_callback_info info) {
  return RunOperation(env, info, Operation::kPrepare);
}

napi_value ExportFrameToFd(napi_env env, napi_callback_info info) {
  return RunOperation(env, info, Operation::kExport);
}

napi_value DeleteTargetIfMatchesRecovery(napi_env env, napi_callback_info info) {
  return RunOperation(env, info, Operation::kDeleteTarget);
}

napi_value RestoreTargetIfAbsent(napi_env env, napi_callback_info info) {
  return RunOperation(env, info, Operation::kRestoreTarget);
}

napi_value CleanupRecoveryIfTargetMatches(napi_env env, napi_callback_info info) {
  return RunOperation(env, info, Operation::kCleanupRecovery);
}

napi_value CleanupRecoveryIfCommitProofMatches(napi_env env, napi_callback_info info) {
  return RunOperation(env, info, Operation::kCleanupRecoveryFromProof);
}

napi_value RecoveryState(napi_env env, napi_callback_info info) {
  return RunOperation(env, info, Operation::kStateRecovery);
}

}  // namespace

NAPI_MODULE_INIT() {
  napi_value prepare = nullptr;
  napi_value exportFrame = nullptr;
  napi_value deleteTarget = nullptr;
  napi_value restoreTarget = nullptr;
  napi_value cleanupRecovery = nullptr;
  napi_value cleanupRecoveryFromProof = nullptr;
  napi_value recoveryState = nullptr;
  if (!CheckNapi(env, napi_create_function(
          env, "prepare", NAPI_AUTO_LENGTH, PrepareForMigration, nullptr, &prepare), "create prepare function")
      || !CheckNapi(env, napi_create_function(
          env, "exportFrameToFd", NAPI_AUTO_LENGTH, ExportFrameToFd, nullptr, &exportFrame),
          "create export function")
      || !CheckNapi(env, napi_create_function(
          env, "deleteTargetIfMatchesRecovery", NAPI_AUTO_LENGTH,
          DeleteTargetIfMatchesRecovery, nullptr, &deleteTarget), "create delete function")
      || !CheckNapi(env, napi_create_function(
          env, "restoreTargetIfAbsent", NAPI_AUTO_LENGTH,
          RestoreTargetIfAbsent, nullptr, &restoreTarget), "create restore function")
      || !CheckNapi(env, napi_create_function(
          env, "cleanupRecoveryIfTargetMatches", NAPI_AUTO_LENGTH,
          CleanupRecoveryIfTargetMatches, nullptr, &cleanupRecovery), "create cleanup function")
      || !CheckNapi(env, napi_create_function(
          env, "cleanupRecoveryIfCommitProofMatches", NAPI_AUTO_LENGTH,
          CleanupRecoveryIfCommitProofMatches, nullptr, &cleanupRecoveryFromProof),
          "create proof cleanup function")
      || !CheckNapi(env, napi_create_function(
          env, "recoveryState", NAPI_AUTO_LENGTH,
          RecoveryState, nullptr, &recoveryState), "create recovery state function")
      || !CheckNapi(env, napi_set_named_property(env, exports, "prepare", prepare), "export prepare function")
      || !CheckNapi(env, napi_set_named_property(
          env, exports, "exportFrameToFd", exportFrame), "export frame function")
      || !CheckNapi(env, napi_set_named_property(
          env, exports, "deleteTargetIfMatchesRecovery", deleteTarget), "export delete function")
      || !CheckNapi(env, napi_set_named_property(
          env, exports, "restoreTargetIfAbsent", restoreTarget), "export restore function")
      || !CheckNapi(env, napi_set_named_property(
          env, exports, "cleanupRecoveryIfTargetMatches", cleanupRecovery), "export cleanup function")
      || !CheckNapi(env, napi_set_named_property(
          env, exports, "cleanupRecoveryIfCommitProofMatches", cleanupRecoveryFromProof),
          "export proof cleanup function")
      || !CheckNapi(env, napi_set_named_property(
          env, exports, "recoveryState", recoveryState), "export recovery state function")) {
    return nullptr;
  }
  return exports;
}

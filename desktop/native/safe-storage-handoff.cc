#include <node_api.h>
#include <Security/Security.h>
#include <CoreFoundation/CoreFoundation.h>
#include <CommonCrypto/CommonDigest.h>
#include <CommonCrypto/CommonHMAC.h>
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <mach-o/dyld.h>
#include <poll.h>
#include <pwd.h>
#include <signal.h>
#include <sys/resource.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

#include <cstdint>
#include <cstring>
#include <string>

namespace {

constexpr char kTargetService[] = "Mineradio Safe Storage";
constexpr char kTargetAccount[] = "Mineradio Key";
constexpr char kStateService[] = "Mineradio Safe Storage Migration State";
constexpr char kPendingAccount[] = "pending-v2";
constexpr char kCompletedAccount[] = "completed-v2";
constexpr char kRecoveryService[] = "Mineradio Safe Storage Migration Recovery";
constexpr char kRecoveryAccount[] = "recovery-v2";
constexpr char kInstalledExecutable[] = "/Applications/Mineradio.app/Contents/MacOS/Mineradio";
constexpr size_t kNonceLength = 32;
constexpr size_t kSafeStoragePasswordLength = 24;
constexpr size_t kCdHashLength = 20;
constexpr size_t kSecretDigestLength = CC_SHA256_DIGEST_LENGTH;
constexpr size_t kMarkerLength = kNonceLength + kCdHashLength + kSecretDigestLength;
constexpr size_t kFramePayloadLength = kNonceLength + kSafeStoragePasswordLength + kCdHashLength;
constexpr size_t kCommitProofPayloadLength = 64;
constexpr size_t kCommitProofWireLength = sizeof(uint32_t) + kCommitProofPayloadLength;
constexpr int kFrameTimeoutMs = 15000;
constexpr unsigned char kCommitProofMagic[8] = {'M', 'R', 'S', 'S', 'P', 'R', 'F', '1'};
constexpr unsigned char kCommitProofVersion = 1;
constexpr unsigned char kCommitProofState = 1;
constexpr char kCommitProofDomain[] = "Mineradio Safe Storage commit proof v1";

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

napi_value ThrowStatus(napi_env env, const char* operation, OSStatus status) {
  const std::string message = std::string(operation) + " failed with OSStatus " + std::to_string(status);
  napi_throw_error(env, nullptr, message.c_str());
  return nullptr;
}

napi_value ThrowMessage(napi_env env, const char* message) {
  napi_throw_error(env, nullptr, message);
  return nullptr;
}

bool CheckNapi(napi_env env, napi_status status, const char* operation) {
  if (status == napi_ok) return true;
  const napi_extended_error_info* details = nullptr;
  napi_get_last_error_info(env, &details);
  const char* detail = details != nullptr && details->error_message != nullptr
    ? details->error_message
    : "unknown N-API error";
  const std::string message = std::string(operation) + ": " + detail;
  napi_throw_error(env, nullptr, message.c_str());
  return false;
}

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

class FdGuard {
 public:
  explicit FdGuard(int fd) : fd_(fd) {}
  ~FdGuard() { if (fd_ >= 0) close(fd_); }
  int get() const { return fd_; }

 private:
  int fd_;
};

int64_t MonotonicMilliseconds();

class MigrationLock {
 public:
  OSStatus Acquire() {
    passwd passwordEntry{};
    passwd* passwordResult = nullptr;
    char passwordBuffer[16384];
    if (getpwuid_r(getuid(), &passwordEntry, passwordBuffer, sizeof(passwordBuffer), &passwordResult) != 0
        || passwordResult == nullptr || passwordEntry.pw_dir == nullptr) return errSecIO;
    const std::string lockDirectory = std::string(passwordEntry.pw_dir)
      + "/Library/Application Support/Mineradio Migration";
    if (mkdir(lockDirectory.c_str(), 0700) != 0 && errno != EEXIST) return errSecIO;
    struct stat directoryStat{};
    if (lstat(lockDirectory.c_str(), &directoryStat) != 0 || !S_ISDIR(directoryStat.st_mode)
        || S_ISLNK(directoryStat.st_mode) || directoryStat.st_uid != getuid()
        || (directoryStat.st_mode & 0077) != 0) return errSecAuthFailed;
    const std::string lockPath = lockDirectory + "/.safe-storage-handoff.lock";
    fd_ = open(lockPath.c_str(), O_RDWR | O_CREAT | O_CLOEXEC | O_NOFOLLOW, 0600);
    if (fd_ < 0) return errSecIO;
    struct stat lockStat{};
    if (fstat(fd_, &lockStat) != 0 || !S_ISREG(lockStat.st_mode) || lockStat.st_uid != getuid()
        || lockStat.st_nlink != 1 || (lockStat.st_mode & 0077) != 0) return errSecAuthFailed;

    const int64_t start = MonotonicMilliseconds();
    if (start < 0) return errSecIO;
    const int64_t deadline = start + kFrameTimeoutMs;
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

struct HandoffFrame {
  unsigned char nonce[kNonceLength];
  unsigned char secret[kSafeStoragePasswordLength];
  unsigned char cdhash[kCdHashLength];

  HandoffFrame() {
    std::memset(nonce, 0, sizeof(nonce));
    std::memset(secret, 0, sizeof(secret));
    std::memset(cdhash, 0, sizeof(cdhash));
  }

  ~HandoffFrame() {
    SecureZero(nonce, sizeof(nonce));
    SecureZero(secret, sizeof(secret));
    SecureZero(cdhash, sizeof(cdhash));
  }
};

int Base64Value(unsigned char value) {
  if (value >= 'A' && value <= 'Z') return value - 'A';
  if (value >= 'a' && value <= 'z') return value - 'a' + 26;
  if (value >= '0' && value <= '9') return value - '0' + 52;
  if (value == '+') return 62;
  if (value == '/') return 63;
  return -1;
}

bool IsCanonicalSafeStoragePassword(const unsigned char* bytes, size_t length) {
  if (length != kSafeStoragePasswordLength || bytes[length - 1] != '=' || bytes[length - 2] != '=') return false;
  for (size_t index = 0; index < length - 2; ++index) {
    if (Base64Value(bytes[index]) < 0) return false;
  }
  const int finalValue = Base64Value(bytes[length - 3]);
  return finalValue >= 0 && (finalValue & 0x0f) == 0;
}

bool HasNonZeroByte(const unsigned char* bytes, size_t length) {
  unsigned char combined = 0;
  for (size_t index = 0; index < length; ++index) combined |= bytes[index];
  return combined != 0;
}

int64_t MonotonicMilliseconds() {
  timespec now{};
  if (clock_gettime(CLOCK_MONOTONIC, &now) != 0) return -1;
  return static_cast<int64_t>(now.tv_sec) * 1000 + now.tv_nsec / 1000000;
}

bool WaitReadable(int fd, int64_t deadline) {
  while (true) {
    const int64_t now = MonotonicMilliseconds();
    if (now < 0 || now >= deadline) return false;
    pollfd descriptor{fd, POLLIN | POLLHUP, 0};
    const int waitMs = static_cast<int>(deadline - now);
    const int result = poll(&descriptor, 1, waitMs);
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

OSStatus ValidateOutputFd(int fd) {
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

bool WaitWritable(int fd, int64_t deadline) {
  while (true) {
    const int64_t now = MonotonicMilliseconds();
    if (now < 0 || now >= deadline) return false;
    pollfd descriptor{fd, POLLOUT, 0};
    const int waitMs = static_cast<int>(deadline - now);
    const int result = poll(&descriptor, 1, waitMs);
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
  if (sigemptyset(&ignorePipe.sa_mask) != 0
      || sigaction(SIGPIPE, &ignorePipe, &previousPipe) != 0) {
    return errSecIO;
  }
  const int64_t start = MonotonicMilliseconds();
  if (start < 0) {
    sigaction(SIGPIPE, &previousPipe, nullptr);
    return errSecIO;
  }
  const int64_t deadline = start + kFrameTimeoutMs;
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

OSStatus DisableCoreDumps() {
  rlimit limit{};
  limit.rlim_cur = 0;
  limit.rlim_max = 0;
  return setrlimit(RLIMIT_CORE, &limit) == 0 ? errSecSuccess : errSecIO;
}

OSStatus ReadFrameFromFd(int fd, HandoffFrame* frame) {
  struct stat descriptorStat{};
  if (fstat(fd, &descriptorStat) != 0 || !(S_ISFIFO(descriptorStat.st_mode) || S_ISSOCK(descriptorStat.st_mode))) {
    return errSecParam;
  }
  const int descriptorFlags = fcntl(fd, F_GETFL);
  if (descriptorFlags < 0 || (descriptorFlags & O_ACCMODE) != O_RDONLY) return errSecParam;
  const int closeFlags = fcntl(fd, F_GETFD);
  if (closeFlags < 0 || fcntl(fd, F_SETFD, closeFlags | FD_CLOEXEC) != 0) return errSecIO;

  const int64_t start = MonotonicMilliseconds();
  if (start < 0) return errSecIO;
  const int64_t deadline = start + kFrameTimeoutMs;
  uint32_t encodedLength = 0;
  if (!ReadExact(fd, reinterpret_cast<unsigned char*>(&encodedLength), sizeof(encodedLength), deadline)) return errSecIO;
  if (ntohl(encodedLength) != kFramePayloadLength) return errSecDecode;
  if (!ReadExact(fd, frame->nonce, sizeof(frame->nonce), deadline)
      || !ReadExact(fd, frame->secret, sizeof(frame->secret), deadline)
      || !ReadExact(fd, frame->cdhash, sizeof(frame->cdhash), deadline)) return errSecIO;

  unsigned char trailing = 0;
  while (true) {
    if (!WaitReadable(fd, deadline)) return errSecIO;
    const ssize_t trailingBytes = read(fd, &trailing, 1);
    if (trailingBytes == 0) break;
    if (trailingBytes < 0 && errno == EINTR) continue;
    return errSecDecode;
  }

  if (!HasNonZeroByte(frame->nonce, sizeof(frame->nonce))
      || !HasNonZeroByte(frame->cdhash, sizeof(frame->cdhash))
      || !IsCanonicalSafeStoragePassword(frame->secret, sizeof(frame->secret))) return errSecDecode;
  return errSecSuccess;
}

OSStatus CopyCurrentCdHash(unsigned char output[kCdHashLength]) {
  SecCodeRef code = nullptr;
  CFDictionaryRef information = nullptr;
  OSStatus status = SecCodeCopySelf(kSecCSDefaultFlags, &code);
  if (status == errSecSuccess) {
    status = SecCodeCopySigningInformation(code, kSecCSSigningInformation, &information);
  }
  if (status == errSecSuccess) {
    CFTypeRef value = CFDictionaryGetValue(information, kSecCodeInfoUnique);
    if (value == nullptr || CFGetTypeID(value) != CFDataGetTypeID()
        || CFDataGetLength(static_cast<CFDataRef>(value)) != kCdHashLength) {
      status = errSecCSBadObjectFormat;
    } else {
      std::memcpy(output, CFDataGetBytePtr(static_cast<CFDataRef>(value)), kCdHashLength);
    }
  }
  if (information != nullptr) CFRelease(information);
  if (code != nullptr) CFRelease(code);
  return status;
}

OSStatus VerifyInstalledRuntime(unsigned char outputCdHash[kCdHashLength]) {
  char executablePath[PATH_MAX];
  uint32_t executablePathLength = sizeof(executablePath);
  if (_NSGetExecutablePath(executablePath, &executablePathLength) != 0) return errSecCSBadObjectFormat;
  char resolvedExecutable[PATH_MAX];
  char resolvedExpected[PATH_MAX];
  if (realpath(executablePath, resolvedExecutable) == nullptr
      || realpath(kInstalledExecutable, resolvedExpected) == nullptr
      || std::strcmp(resolvedExecutable, resolvedExpected) != 0) return errSecAuthFailed;

  return CopyCurrentCdHash(outputCdHash);
}

OSStatus VerifyRuntimeIdentity(const HandoffFrame& frame) {
  unsigned char currentCdHash[kCdHashLength];
  std::memset(currentCdHash, 0, sizeof(currentCdHash));
  OSStatus status = VerifyInstalledRuntime(currentCdHash);
  if (status == errSecSuccess && !ConstantTimeEqual(currentCdHash, frame.cdhash, sizeof(currentCdHash))) {
    status = errSecCSReqFailed;
  }
  SecureZero(currentCdHash, sizeof(currentCdHash));
  return status;
}

SecKeychainRef DefaultKeychain(OSStatus* outputStatus) {
  SecKeychainRef keychain = nullptr;
  *outputStatus = SecKeychainCopyDefault(&keychain);
  if (*outputStatus == errSecSuccess && keychain == nullptr) *outputStatus = errSecInvalidKeychain;
  return keychain;
}

bool ItemBelongsToKeychain(SecKeychainItemRef item, SecKeychainRef expected, OSStatus* outputStatus) {
  SecKeychainRef actual = nullptr;
  OSStatus status = SecKeychainItemCopyKeychain(item, &actual);
  if (status != errSecSuccess) {
    *outputStatus = status;
    return false;
  }
  const bool matches = CFEqual(actual, expected);
  CFRelease(actual);
  *outputStatus = matches ? errSecSuccess : errSecInvalidKeychain;
  return matches;
}

SecKeychainItemRef FindUniqueItem(
    SecKeychainRef expectedKeychain,
    const char* service,
    const char* account,
    bool allowMissing,
    OSStatus* outputStatus) {
  SecKeychainAttribute attributes[] = {
    {kSecServiceItemAttr, static_cast<UInt32>(std::strlen(service)), const_cast<char*>(service)},
    {kSecAccountItemAttr, static_cast<UInt32>(std::strlen(account)), const_cast<char*>(account)},
  };
  SecKeychainAttributeList attributeList = {2, attributes};
  SecKeychainSearchRef search = nullptr;
  OSStatus status = SecKeychainSearchCreateFromAttributes(
      nullptr, kSecGenericPasswordItemClass, &attributeList, &search);
  if (status != errSecSuccess) {
    *outputStatus = status;
    return nullptr;
  }

  SecKeychainItemRef match = nullptr;
  uint32_t count = 0;
  while (true) {
    SecKeychainItemRef item = nullptr;
    status = SecKeychainSearchCopyNext(search, &item);
    if (status == errSecItemNotFound) break;
    if (status != errSecSuccess) {
      if (item != nullptr) CFRelease(item);
      if (match != nullptr) CFRelease(match);
      CFRelease(search);
      *outputStatus = status;
      return nullptr;
    }
    ++count;
    if (count == 1) match = item;
    else CFRelease(item);
  }
  CFRelease(search);

  if (count > 1) {
    if (match != nullptr) CFRelease(match);
    *outputStatus = errSecDuplicateItem;
    return nullptr;
  }
  if (count == 0) {
    *outputStatus = allowMissing ? errSecSuccess : errSecItemNotFound;
    return nullptr;
  }
  if (!ItemBelongsToKeychain(match, expectedKeychain, outputStatus)) {
    CFRelease(match);
    return nullptr;
  }
  *outputStatus = errSecSuccess;
  return match;
}

bool ItemExists(
    SecKeychainRef keychain,
    const char* service,
    const char* account,
    OSStatus* outputStatus) {
  SecKeychainItemRef item = FindUniqueItem(keychain, service, account, true, outputStatus);
  if (item != nullptr) CFRelease(item);
  return item != nullptr;
}

OSStatus AddPassword(
    SecKeychainRef keychain,
    const char* service,
    const char* account,
    const void* bytes,
    UInt32 length,
    SecKeychainItemRef* outputItem) {
  return SecKeychainAddGenericPassword(
      keychain,
      static_cast<UInt32>(std::strlen(service)), service,
      static_cast<UInt32>(std::strlen(account)), account,
      length, bytes, outputItem);
}

OSStatus ReadPassword(SecKeychainItemRef item, unsigned char* output, size_t expectedLength) {
  UInt32 length = 0;
  void* bytes = nullptr;
  OSStatus status = SecKeychainItemCopyContent(item, nullptr, nullptr, &length, &bytes);
  if (status != errSecSuccess) return status;
  if (length != expectedLength || bytes == nullptr) {
    if (bytes != nullptr) {
      SecureZero(bytes, length);
      SecKeychainItemFreeContent(nullptr, bytes);
    }
    return errSecDecode;
  }
  std::memcpy(output, bytes, length);
  SecureZero(bytes, length);
  SecKeychainItemFreeContent(nullptr, bytes);
  return errSecSuccess;
}

OSStatus ComparePassword(SecKeychainItemRef item, const unsigned char* expected, size_t length) {
  static_assert(kMarkerLength >= kSafeStoragePasswordLength);
  unsigned char actual[kMarkerLength];
  if (length > sizeof(actual)) return errSecParam;
  std::memset(actual, 0, sizeof(actual));
  OSStatus status = ReadPassword(item, actual, length);
  if (status == errSecSuccess && !ConstantTimeEqual(actual, expected, length)) status = errSecVerifyFailed;
  SecureZero(actual, sizeof(actual));
  return status;
}

OSStatus AddVerifiedPassword(
    SecKeychainRef keychain,
    const char* service,
    const char* account,
    const unsigned char* bytes,
    size_t length,
    SecKeychainItemRef* outputItem) {
  SecKeychainItemRef item = nullptr;
  OSStatus status = AddPassword(
      keychain, service, account, bytes, static_cast<UInt32>(length), &item);
  if (status != errSecSuccess) return status;
  status = ComparePassword(item, bytes, length);
  if (status != errSecSuccess) {
    const OSStatus cleanupStatus = SecKeychainItemDelete(item);
    CFRelease(item);
    return cleanupStatus == errSecSuccess ? status : cleanupStatus;
  }
  if (outputItem != nullptr) *outputItem = item;
  else CFRelease(item);
  return errSecSuccess;
}

void BuildMarker(const HandoffFrame& frame, unsigned char marker[kMarkerLength]) {
  std::memcpy(marker, frame.nonce, kNonceLength);
  std::memcpy(marker + kNonceLength, frame.cdhash, kCdHashLength);
  CC_SHA256(
      frame.secret,
      static_cast<CC_LONG>(sizeof(frame.secret)),
      marker + kNonceLength + kCdHashLength);
}

napi_value StateObject(napi_env env, bool target, bool pending, bool completed) {
  napi_value result = nullptr;
  napi_value value = nullptr;
  if (!CheckNapi(env, napi_create_object(env, &result), "create state object")) return nullptr;
  if (!CheckNapi(env, napi_get_boolean(env, true, &value), "create ok value")
      || !CheckNapi(env, napi_set_named_property(env, result, "ok", value), "set ok value")
      || !CheckNapi(env, napi_get_boolean(env, target, &value), "create target value")
      || !CheckNapi(env, napi_set_named_property(env, result, "target", value), "set target value")
      || !CheckNapi(env, napi_get_boolean(env, pending, &value), "create pending value")
      || !CheckNapi(env, napi_set_named_property(env, result, "pending", value), "set pending value")
      || !CheckNapi(env, napi_get_boolean(env, completed, &value), "create completed value")
      || !CheckNapi(env, napi_set_named_property(env, result, "completed", value), "set completed value")) {
    return nullptr;
  }
  return result;
}

napi_value CurrentState(napi_env env, SecKeychainRef keychain) {
  OSStatus status = errSecSuccess;
  const bool target = ItemExists(keychain, kTargetService, kTargetAccount, &status);
  if (status != errSecSuccess) return ThrowStatus(env, "query target", status);
  const bool pending = ItemExists(keychain, kStateService, kPendingAccount, &status);
  if (status != errSecSuccess) return ThrowStatus(env, "query pending marker", status);
  const bool completed = ItemExists(keychain, kStateService, kCompletedAccount, &status);
  if (status != errSecSuccess) return ThrowStatus(env, "query completed marker", status);
  return StateObject(env, target, pending, completed);
}

OSStatus Install(SecKeychainRef keychain, const HandoffFrame& frame) {
  unsigned char marker[kMarkerLength];
  std::memset(marker, 0, sizeof(marker));
  BuildMarker(frame, marker);

  OSStatus status = errSecSuccess;
  SecKeychainItemRef completed = FindUniqueItem(
      keychain, kStateService, kCompletedAccount, true, &status);
  if (status != errSecSuccess) {
    SecureZero(marker, sizeof(marker));
    return status;
  }
  if (completed != nullptr) {
    CFRelease(completed);
    SecureZero(marker, sizeof(marker));
    return errSecDuplicateItem;
  }

  SecKeychainItemRef pending = FindUniqueItem(
      keychain, kStateService, kPendingAccount, true, &status);
  if (status != errSecSuccess) {
    SecureZero(marker, sizeof(marker));
    return status;
  }
  if (pending == nullptr) {
    SecKeychainItemRef targetBeforePending = FindUniqueItem(
        keychain, kTargetService, kTargetAccount, true, &status);
    const bool targetAlreadyExists = targetBeforePending != nullptr;
    if (targetBeforePending != nullptr) CFRelease(targetBeforePending);
    if (status != errSecSuccess || targetAlreadyExists) {
      SecureZero(marker, sizeof(marker));
      return status == errSecSuccess ? errSecDuplicateItem : status;
    }
    status = AddVerifiedPassword(
        keychain, kStateService, kPendingAccount, marker, sizeof(marker), &pending);
    if (status != errSecSuccess) {
      SecureZero(marker, sizeof(marker));
      return status;
    }
  } else {
    status = ComparePassword(pending, marker, sizeof(marker));
    if (status != errSecSuccess) {
      CFRelease(pending);
      SecureZero(marker, sizeof(marker));
      return status;
    }
  }

  SecKeychainItemRef target = FindUniqueItem(
      keychain, kTargetService, kTargetAccount, true, &status);
  if (status == errSecSuccess && target == nullptr) {
    status = AddVerifiedPassword(
        keychain, kTargetService, kTargetAccount, frame.secret, sizeof(frame.secret), &target);
  } else if (status == errSecSuccess) {
    status = ComparePassword(target, frame.secret, sizeof(frame.secret));
  }
  if (target != nullptr) CFRelease(target);
  if (pending != nullptr) CFRelease(pending);
  SecureZero(marker, sizeof(marker));
  return status;
}

OSStatus Rollback(SecKeychainRef keychain, const HandoffFrame& frame) {
  unsigned char marker[kMarkerLength];
  std::memset(marker, 0, sizeof(marker));
  BuildMarker(frame, marker);
  OSStatus status = errSecSuccess;

  SecKeychainItemRef pending = FindUniqueItem(
      keychain, kStateService, kPendingAccount, true, &status);
  if (status == errSecSuccess && pending != nullptr) {
    status = ComparePassword(pending, marker, sizeof(marker));
  }

  SecKeychainItemRef completed = nullptr;
  if (status == errSecSuccess) completed = FindUniqueItem(
      keychain, kStateService, kCompletedAccount, true, &status);
  if (status == errSecSuccess && completed != nullptr) {
    const OSStatus compareStatus = ComparePassword(completed, marker, sizeof(marker));
    status = compareStatus == errSecSuccess ? errSecAuthFailed : compareStatus;
  }

  SecKeychainItemRef target = nullptr;
  if (status == errSecSuccess) {
    target = FindUniqueItem(keychain, kTargetService, kTargetAccount, true, &status);
  }
  if (status == errSecSuccess && pending == nullptr && target != nullptr) {
    status = errSecItemNotFound;
  } else if (status == errSecSuccess && target != nullptr) {
    status = ComparePassword(target, frame.secret, sizeof(frame.secret));
    if (status == errSecSuccess) status = SecKeychainItemDelete(target);
  }
  if (status == errSecSuccess && pending != nullptr) status = SecKeychainItemDelete(pending);

  if (target != nullptr) CFRelease(target);
  if (completed != nullptr) CFRelease(completed);
  if (pending != nullptr) CFRelease(pending);
  SecureZero(marker, sizeof(marker));
  return status;
}

OSStatus Commit(SecKeychainRef keychain, const HandoffFrame& frame) {
  unsigned char marker[kMarkerLength];
  std::memset(marker, 0, sizeof(marker));
  BuildMarker(frame, marker);
  OSStatus status = errSecSuccess;

  SecKeychainItemRef target = FindUniqueItem(
      keychain, kTargetService, kTargetAccount, false, &status);
  if (status == errSecSuccess && target != nullptr) {
    status = ComparePassword(target, frame.secret, sizeof(frame.secret));
  }

  SecKeychainItemRef pending = nullptr;
  SecKeychainItemRef completed = nullptr;
  if (status == errSecSuccess) {
    pending = FindUniqueItem(keychain, kStateService, kPendingAccount, true, &status);
  }
  if (status == errSecSuccess) {
    completed = FindUniqueItem(keychain, kStateService, kCompletedAccount, true, &status);
  }
  if (status == errSecSuccess && pending == nullptr && completed == nullptr) status = errSecItemNotFound;
  if (status == errSecSuccess && pending != nullptr) status = ComparePassword(pending, marker, sizeof(marker));
  if (status == errSecSuccess && completed != nullptr) status = ComparePassword(completed, marker, sizeof(marker));
  if (status == errSecSuccess && completed == nullptr) {
    status = AddVerifiedPassword(
        keychain, kStateService, kCompletedAccount, marker, sizeof(marker), &completed);
  }
  if (status == errSecSuccess && pending != nullptr) status = SecKeychainItemDelete(pending);

  if (target != nullptr) CFRelease(target);
  if (pending != nullptr) CFRelease(pending);
  if (completed != nullptr) CFRelease(completed);
  SecureZero(marker, sizeof(marker));
  return status;
}

OSStatus CleanupCommittedState(
    SecKeychainRef keychain,
    const unsigned char currentCdHash[kCdHashLength]) {
  OSStatus status = errSecSuccess;

  SecKeychainItemRef target = FindUniqueItem(
      keychain, kTargetService, kTargetAccount, false, &status);
  SecKeychainItemRef pending = nullptr;
  if (status == errSecSuccess) {
    pending = FindUniqueItem(keychain, kStateService, kPendingAccount, true, &status);
  }
  if (status == errSecSuccess && pending != nullptr) status = errSecAuthFailed;
  SecKeychainItemRef recovery = nullptr;
  if (status == errSecSuccess) {
    recovery = FindUniqueItem(keychain, kRecoveryService, kRecoveryAccount, true, &status);
  }
  if (status == errSecSuccess && recovery != nullptr) status = errSecAuthFailed;
  SecKeychainItemRef completed = nullptr;
  if (status == errSecSuccess) {
    completed = FindUniqueItem(keychain, kStateService, kCompletedAccount, true, &status);
  }

  unsigned char secret[kSafeStoragePasswordLength];
  unsigned char marker[kMarkerLength];
  unsigned char digest[kSecretDigestLength];
  std::memset(secret, 0, sizeof(secret));
  std::memset(marker, 0, sizeof(marker));
  std::memset(digest, 0, sizeof(digest));
  if (status == errSecSuccess) status = ReadPassword(target, secret, sizeof(secret));
  if (status == errSecSuccess && !IsCanonicalSafeStoragePassword(secret, sizeof(secret))) {
    status = errSecDecode;
  }
  if (status == errSecSuccess && completed != nullptr) {
    status = ReadPassword(completed, marker, sizeof(marker));
    if (status == errSecSuccess && (!HasNonZeroByte(marker, kNonceLength)
        || !ConstantTimeEqual(marker + kNonceLength, currentCdHash, kCdHashLength))) {
      status = errSecVerifyFailed;
    }
    if (status == errSecSuccess) {
      CC_SHA256(secret, static_cast<CC_LONG>(sizeof(secret)), digest);
      if (!ConstantTimeEqual(
              marker + kNonceLength + kCdHashLength, digest, sizeof(digest))) {
        status = errSecVerifyFailed;
      }
    }
    if (status == errSecSuccess) status = SecKeychainItemDelete(completed);
  }
  if (status == errSecSuccess) {
    SecKeychainItemRef remaining = FindUniqueItem(
        keychain, kStateService, kCompletedAccount, true, &status);
    if (status == errSecSuccess && remaining != nullptr) status = errSecDuplicateItem;
    if (remaining != nullptr) CFRelease(remaining);
  }
  if (status == errSecSuccess) {
    status = ComparePassword(target, secret, sizeof(secret));
  }

  SecureZero(digest, sizeof(digest));
  SecureZero(marker, sizeof(marker));
  SecureZero(secret, sizeof(secret));
  if (target != nullptr) CFRelease(target);
  if (pending != nullptr) CFRelease(pending);
  if (recovery != nullptr) CFRelease(recovery);
  if (completed != nullptr) CFRelease(completed);
  return status;
}

OSStatus ExportCommitProof(
    SecKeychainRef keychain,
    int fd,
    const unsigned char currentCdHash[kCdHashLength]) {
  OSStatus status = ValidateOutputFd(fd);
  if (status != errSecSuccess) return status;

  SecKeychainItemRef target = FindUniqueItem(
      keychain, kTargetService, kTargetAccount, false, &status);
  SecKeychainItemRef pending = nullptr;
  SecKeychainItemRef completed = nullptr;
  if (status == errSecSuccess) {
    pending = FindUniqueItem(keychain, kStateService, kPendingAccount, true, &status);
  }
  if (status == errSecSuccess && pending != nullptr) status = errSecAuthFailed;
  if (status == errSecSuccess) {
    completed = FindUniqueItem(keychain, kStateService, kCompletedAccount, false, &status);
  }

  unsigned char secret[kSafeStoragePasswordLength];
  unsigned char marker[kMarkerLength];
  unsigned char digest[kSecretDigestLength];
  unsigned char message[sizeof(kCommitProofDomain) + kMarkerLength + 1];
  unsigned char proof[kCommitProofPayloadLength];
  unsigned char wire[kCommitProofWireLength];
  std::memset(secret, 0, sizeof(secret));
  std::memset(marker, 0, sizeof(marker));
  std::memset(digest, 0, sizeof(digest));
  std::memset(message, 0, sizeof(message));
  std::memset(proof, 0, sizeof(proof));
  std::memset(wire, 0, sizeof(wire));

  if (status == errSecSuccess) status = ReadPassword(target, secret, sizeof(secret));
  if (status == errSecSuccess && !IsCanonicalSafeStoragePassword(secret, sizeof(secret))) {
    status = errSecDecode;
  }
  if (status == errSecSuccess) status = ReadPassword(completed, marker, sizeof(marker));
  if (status == errSecSuccess && (!HasNonZeroByte(marker, kNonceLength)
      || !ConstantTimeEqual(marker + kNonceLength, currentCdHash, kCdHashLength))) {
    status = errSecVerifyFailed;
  }
  if (status == errSecSuccess) {
    CC_SHA256(secret, static_cast<CC_LONG>(sizeof(secret)), digest);
    if (!ConstantTimeEqual(
            marker + kNonceLength + kCdHashLength, digest, sizeof(digest))) {
      status = errSecVerifyFailed;
    }
  }
  if (status == errSecSuccess) {
    std::memcpy(message, kCommitProofDomain, sizeof(kCommitProofDomain));
    std::memcpy(message + sizeof(kCommitProofDomain), marker, sizeof(marker));
    message[sizeof(kCommitProofDomain) + sizeof(marker)] = kCommitProofState;

    std::memcpy(proof, kCommitProofMagic, sizeof(kCommitProofMagic));
    proof[8] = kCommitProofVersion;
    proof[9] = kCommitProofState;
    std::memcpy(proof + 12, currentCdHash, kCdHashLength);
    CCHmac(
        kCCHmacAlgSHA256,
        secret,
        sizeof(secret),
        message,
        sizeof(message),
        proof + 32);

    status = ComparePassword(target, secret, sizeof(secret));
    if (status == errSecSuccess) status = ComparePassword(completed, marker, sizeof(marker));
  }
  if (status == errSecSuccess) {
    const uint32_t encodedLength = htonl(static_cast<uint32_t>(sizeof(proof)));
    std::memcpy(wire, &encodedLength, sizeof(encodedLength));
    std::memcpy(wire + sizeof(encodedLength), proof, sizeof(proof));
    status = WriteExact(fd, wire, sizeof(wire));
  }

  SecureZero(wire, sizeof(wire));
  SecureZero(proof, sizeof(proof));
  SecureZero(message, sizeof(message));
  SecureZero(digest, sizeof(digest));
  SecureZero(marker, sizeof(marker));
  SecureZero(secret, sizeof(secret));
  if (target != nullptr) CFRelease(target);
  if (pending != nullptr) CFRelease(pending);
  if (completed != nullptr) CFRelease(completed);
  return status;
}

enum class Operation { kInstall, kRollback, kCommit };

napi_value RunOperation(napi_env env, napi_callback_info info, Operation operation) {
  size_t argc = 1;
  napi_value argv[1];
  if (!CheckNapi(env, napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr), "read handoff arguments")) {
    return nullptr;
  }
  int32_t fd = -1;
  if (argc != 1) return ThrowMessage(env, "handoff accepts exactly one inherited fd argument");
  if (!CheckNapi(env, napi_get_value_int32(env, argv[0], &fd), "read handoff fd")) return nullptr;
  if (fd != 3) return ThrowMessage(env, "handoff requires inherited binary pipe fd 3");
  FdGuard fdGuard(fd);
  OSStatus status = DisableCoreDumps();
  if (status != errSecSuccess) return ThrowStatus(env, "disable core dumps", status);
  HandoffFrame frame;
  status = ReadFrameFromFd(fdGuard.get(), &frame);
  if (status != errSecSuccess) return ThrowStatus(env, "read authenticated handoff frame", status);
  status = VerifyRuntimeIdentity(frame);
  if (status != errSecSuccess) return ThrowStatus(env, "verify installed app identity", status);

  MigrationLock migrationLock;
  status = migrationLock.Acquire();
  if (status != errSecSuccess) return ThrowStatus(env, "acquire Safe Storage migration lock", status);

  InteractionGuard interaction;
  status = interaction.Disable();
  if (status != errSecSuccess) return ThrowStatus(env, "disable Keychain interaction", status);
  SecKeychainRef keychain = DefaultKeychain(&status);
  if (status != errSecSuccess || keychain == nullptr) {
    return ThrowStatus(env, "open default keychain", status);
  }

  if (operation == Operation::kInstall) status = Install(keychain, frame);
  else if (operation == Operation::kRollback) status = Rollback(keychain, frame);
  else status = Commit(keychain, frame);

  napi_value result = nullptr;
  if (status == errSecSuccess) result = CurrentState(env, keychain);
  CFRelease(keychain);
  if (status != errSecSuccess) return ThrowStatus(env, "apply Safe Storage handoff", status);
  return result;
}

napi_value InstallFromFd(napi_env env, napi_callback_info info) {
  return RunOperation(env, info, Operation::kInstall);
}

napi_value RollbackFromFd(napi_env env, napi_callback_info info) {
  return RunOperation(env, info, Operation::kRollback);
}

napi_value CommitFromFd(napi_env env, napi_callback_info info) {
  return RunOperation(env, info, Operation::kCommit);
}

napi_value ExportCommitProofToFd(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  if (!CheckNapi(env, napi_get_cb_info(
          env, info, &argc, argv, nullptr, nullptr), "read commit proof arguments")) {
    return nullptr;
  }
  int32_t fd = -1;
  if (argc != 1) return ThrowMessage(env, "exportCommitProofToFd accepts exactly one inherited fd");
  if (!CheckNapi(env, napi_get_value_int32(env, argv[0], &fd), "read commit proof fd")) return nullptr;
  if (fd != 3) return ThrowMessage(env, "exportCommitProofToFd requires inherited binary pipe fd 3");
  FdGuard fdGuard(fd);

  OSStatus status = DisableCoreDumps();
  if (status != errSecSuccess) return ThrowStatus(env, "disable core dumps", status);
  unsigned char currentCdHash[kCdHashLength];
  std::memset(currentCdHash, 0, sizeof(currentCdHash));
  status = VerifyInstalledRuntime(currentCdHash);
  if (status != errSecSuccess) {
    SecureZero(currentCdHash, sizeof(currentCdHash));
    return ThrowStatus(env, "verify installed app identity", status);
  }

  MigrationLock migrationLock;
  status = migrationLock.Acquire();
  if (status != errSecSuccess) {
    SecureZero(currentCdHash, sizeof(currentCdHash));
    return ThrowStatus(env, "acquire Safe Storage migration lock", status);
  }
  InteractionGuard interaction;
  status = interaction.Disable();
  if (status != errSecSuccess) {
    SecureZero(currentCdHash, sizeof(currentCdHash));
    return ThrowStatus(env, "disable Keychain interaction", status);
  }
  SecKeychainRef keychain = DefaultKeychain(&status);
  if (status != errSecSuccess || keychain == nullptr) {
    SecureZero(currentCdHash, sizeof(currentCdHash));
    return ThrowStatus(env, "open default keychain", status);
  }
  status = ExportCommitProof(keychain, fdGuard.get(), currentCdHash);
  SecureZero(currentCdHash, sizeof(currentCdHash));

  napi_value result = nullptr;
  if (status == errSecSuccess) result = CurrentState(env, keychain);
  CFRelease(keychain);
  if (status != errSecSuccess) return ThrowStatus(env, "export committed Safe Storage proof", status);
  return result;
}

napi_value CleanupCommittedStateForCurrentApp(napi_env env, napi_callback_info info) {
  size_t argc = 0;
  if (!CheckNapi(env, napi_get_cb_info(
          env, info, &argc, nullptr, nullptr, nullptr), "read committed cleanup arguments")) {
    return nullptr;
  }
  if (argc != 0) return ThrowMessage(env, "cleanupCommittedState accepts no arguments");
  OSStatus status = DisableCoreDumps();
  if (status != errSecSuccess) return ThrowStatus(env, "disable core dumps", status);
  unsigned char currentCdHash[kCdHashLength];
  std::memset(currentCdHash, 0, sizeof(currentCdHash));
  status = VerifyInstalledRuntime(currentCdHash);
  if (status != errSecSuccess) {
    SecureZero(currentCdHash, sizeof(currentCdHash));
    return ThrowStatus(env, "verify installed app identity", status);
  }

  MigrationLock migrationLock;
  status = migrationLock.Acquire();
  if (status != errSecSuccess) {
    SecureZero(currentCdHash, sizeof(currentCdHash));
    return ThrowStatus(env, "acquire Safe Storage migration lock", status);
  }
  InteractionGuard interaction;
  status = interaction.Disable();
  if (status != errSecSuccess) {
    SecureZero(currentCdHash, sizeof(currentCdHash));
    return ThrowStatus(env, "disable Keychain interaction", status);
  }
  SecKeychainRef keychain = DefaultKeychain(&status);
  if (status != errSecSuccess || keychain == nullptr) {
    SecureZero(currentCdHash, sizeof(currentCdHash));
    return ThrowStatus(env, "open default keychain", status);
  }
  status = CleanupCommittedState(keychain, currentCdHash);
  SecureZero(currentCdHash, sizeof(currentCdHash));

  napi_value result = nullptr;
  if (status == errSecSuccess) result = CurrentState(env, keychain);
  CFRelease(keychain);
  if (status != errSecSuccess) return ThrowStatus(env, "clean committed Safe Storage state", status);
  return result;
}

napi_value State(napi_env env, napi_callback_info info) {
  size_t argc = 0;
  if (!CheckNapi(env, napi_get_cb_info(env, info, &argc, nullptr, nullptr, nullptr), "read state arguments")) {
    return nullptr;
  }
  if (argc != 0) return ThrowMessage(env, "state accepts no arguments");
  MigrationLock migrationLock;
  OSStatus status = migrationLock.Acquire();
  if (status != errSecSuccess) return ThrowStatus(env, "acquire Safe Storage migration lock", status);
  InteractionGuard interaction;
  status = interaction.Disable();
  if (status != errSecSuccess) return ThrowStatus(env, "disable Keychain interaction", status);
  SecKeychainRef keychain = DefaultKeychain(&status);
  if (status != errSecSuccess || keychain == nullptr) return ThrowStatus(env, "open default keychain", status);
  napi_value result = CurrentState(env, keychain);
  CFRelease(keychain);
  return result;
}

}  // namespace

NAPI_MODULE_INIT() {
  napi_value install = nullptr;
  napi_value rollback = nullptr;
  napi_value commit = nullptr;
  napi_value cleanupCommittedState = nullptr;
  napi_value exportCommitProof = nullptr;
  napi_value state = nullptr;
  if (!CheckNapi(env, napi_create_function(
          env, "installFromFd", NAPI_AUTO_LENGTH, InstallFromFd, nullptr, &install), "create install function")
      || !CheckNapi(env, napi_create_function(
          env, "rollbackFromFd", NAPI_AUTO_LENGTH, RollbackFromFd, nullptr, &rollback), "create rollback function")
      || !CheckNapi(env, napi_create_function(
          env, "commitFromFd", NAPI_AUTO_LENGTH, CommitFromFd, nullptr, &commit), "create commit function")
      || !CheckNapi(env, napi_create_function(
          env, "cleanupCommittedState", NAPI_AUTO_LENGTH,
          CleanupCommittedStateForCurrentApp, nullptr, &cleanupCommittedState),
          "create committed cleanup function")
      || !CheckNapi(env, napi_create_function(
          env, "exportCommitProofToFd", NAPI_AUTO_LENGTH,
          ExportCommitProofToFd, nullptr, &exportCommitProof), "create commit proof function")
      || !CheckNapi(env, napi_create_function(
          env, "state", NAPI_AUTO_LENGTH, State, nullptr, &state), "create state function")
      || !CheckNapi(env, napi_set_named_property(env, exports, "installFromFd", install), "export install function")
      || !CheckNapi(env, napi_set_named_property(env, exports, "rollbackFromFd", rollback), "export rollback function")
      || !CheckNapi(env, napi_set_named_property(env, exports, "commitFromFd", commit), "export commit function")
      || !CheckNapi(env, napi_set_named_property(
          env, exports, "cleanupCommittedState", cleanupCommittedState),
          "export committed cleanup function")
      || !CheckNapi(env, napi_set_named_property(
          env, exports, "exportCommitProofToFd", exportCommitProof), "export commit proof function")
      || !CheckNapi(env, napi_set_named_property(env, exports, "state", state), "export state function")) {
    return nullptr;
  }
  return exports;
}

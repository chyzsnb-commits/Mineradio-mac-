// ====================================================================
//  QQ 音乐逐字歌词(QRC)解密 + 归一为网易 yrc 格式
//  - 为什么需要自研 DES:QQ 的 qrc 用的是一份"故意有 bug"的 DES
//    (S-box 个别值与 FIPS 标准不同 + BITNUM 宏按 4 字节组内倒序取字节),
//    Node 内置 crypto / 标准 3DES 都解不出,必须逐行忠实移植。
//    移植来源:wangqr/QQMusicDES(QQMusicCommon.dll 的替代实现,B-Con/crypto-algorithms 改)。
//  - 解密链路:hex -> 三重 DES( dec K1 -> enc K2 -> dec K3 ) -> zlib inflate -> QRC XML。
//    三把 8 字节子密钥即社区公认的 QRC 密钥拆分。
//  - 归一:QRC 是"文本在前、时间在后"`字(startMs,durMs)`;网易 yrc 是"时间在前"
//    `(startMs,durMs,0)字`。前端 parseYrcText 只认 yrc,故在此翻面复用现成逐字渲染。
// ====================================================================
'use strict';
const zlib = require('zlib');

const DES_ENCRYPT = 1;
const DES_DECRYPT = 0;

// 注意:sbox2[23]、sbox4[53] 等与标准 DES 不同,是 QQ DES 的"bug",必须原样保留。
const sbox1 = [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13];
const sbox2 = [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,15,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9];
const sbox3 = [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12];
const sbox4 = [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,10,13,8,9,4,5,11,12,7,2,14];
const sbox5 = [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3];
const sbox6 = [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13];
const sbox7 = [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12];
const sbox8 = [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11];

const u = (x) => x >>> 0;
// BITNUM 的字节下标 (b/32)*4+3-(b%32)/8 即 QQ DES 的"4 字节组内倒序"bug,原样保留
function BITNUM(a, b, c) { return u((((a[((b / 32) | 0) * 4 + 3 - (((b % 32) / 8) | 0)] >> (7 - (b % 8))) & 1) << c)); }
function BITNUMINTR(a, b, c) { return u((((a >>> (31 - b)) & 1) << c)); }
function BITNUMINTL(a, b, c) { return u(((u(a << b) & 0x80000000) >>> c)); }
function SBOXBIT(a) { return (a & 0x20) | ((a & 0x1f) >> 1) | ((a & 0x01) << 4); }

function IP(state, inp) {
  state[0] = u(BITNUM(inp,57,31)|BITNUM(inp,49,30)|BITNUM(inp,41,29)|BITNUM(inp,33,28)|BITNUM(inp,25,27)|BITNUM(inp,17,26)|BITNUM(inp,9,25)|BITNUM(inp,1,24)|BITNUM(inp,59,23)|BITNUM(inp,51,22)|BITNUM(inp,43,21)|BITNUM(inp,35,20)|BITNUM(inp,27,19)|BITNUM(inp,19,18)|BITNUM(inp,11,17)|BITNUM(inp,3,16)|BITNUM(inp,61,15)|BITNUM(inp,53,14)|BITNUM(inp,45,13)|BITNUM(inp,37,12)|BITNUM(inp,29,11)|BITNUM(inp,21,10)|BITNUM(inp,13,9)|BITNUM(inp,5,8)|BITNUM(inp,63,7)|BITNUM(inp,55,6)|BITNUM(inp,47,5)|BITNUM(inp,39,4)|BITNUM(inp,31,3)|BITNUM(inp,23,2)|BITNUM(inp,15,1)|BITNUM(inp,7,0));
  state[1] = u(BITNUM(inp,56,31)|BITNUM(inp,48,30)|BITNUM(inp,40,29)|BITNUM(inp,32,28)|BITNUM(inp,24,27)|BITNUM(inp,16,26)|BITNUM(inp,8,25)|BITNUM(inp,0,24)|BITNUM(inp,58,23)|BITNUM(inp,50,22)|BITNUM(inp,42,21)|BITNUM(inp,34,20)|BITNUM(inp,26,19)|BITNUM(inp,18,18)|BITNUM(inp,10,17)|BITNUM(inp,2,16)|BITNUM(inp,60,15)|BITNUM(inp,52,14)|BITNUM(inp,44,13)|BITNUM(inp,36,12)|BITNUM(inp,28,11)|BITNUM(inp,20,10)|BITNUM(inp,12,9)|BITNUM(inp,4,8)|BITNUM(inp,62,7)|BITNUM(inp,54,6)|BITNUM(inp,46,5)|BITNUM(inp,38,4)|BITNUM(inp,30,3)|BITNUM(inp,22,2)|BITNUM(inp,14,1)|BITNUM(inp,6,0));
}
function InvIP(state, out) {
  out[3] = BITNUMINTR(state[1],7,7)|BITNUMINTR(state[0],7,6)|BITNUMINTR(state[1],15,5)|BITNUMINTR(state[0],15,4)|BITNUMINTR(state[1],23,3)|BITNUMINTR(state[0],23,2)|BITNUMINTR(state[1],31,1)|BITNUMINTR(state[0],31,0);
  out[2] = BITNUMINTR(state[1],6,7)|BITNUMINTR(state[0],6,6)|BITNUMINTR(state[1],14,5)|BITNUMINTR(state[0],14,4)|BITNUMINTR(state[1],22,3)|BITNUMINTR(state[0],22,2)|BITNUMINTR(state[1],30,1)|BITNUMINTR(state[0],30,0);
  out[1] = BITNUMINTR(state[1],5,7)|BITNUMINTR(state[0],5,6)|BITNUMINTR(state[1],13,5)|BITNUMINTR(state[0],13,4)|BITNUMINTR(state[1],21,3)|BITNUMINTR(state[0],21,2)|BITNUMINTR(state[1],29,1)|BITNUMINTR(state[0],29,0);
  out[0] = BITNUMINTR(state[1],4,7)|BITNUMINTR(state[0],4,6)|BITNUMINTR(state[1],12,5)|BITNUMINTR(state[0],12,4)|BITNUMINTR(state[1],20,3)|BITNUMINTR(state[0],20,2)|BITNUMINTR(state[1],28,1)|BITNUMINTR(state[0],28,0);
  out[7] = BITNUMINTR(state[1],3,7)|BITNUMINTR(state[0],3,6)|BITNUMINTR(state[1],11,5)|BITNUMINTR(state[0],11,4)|BITNUMINTR(state[1],19,3)|BITNUMINTR(state[0],19,2)|BITNUMINTR(state[1],27,1)|BITNUMINTR(state[0],27,0);
  out[6] = BITNUMINTR(state[1],2,7)|BITNUMINTR(state[0],2,6)|BITNUMINTR(state[1],10,5)|BITNUMINTR(state[0],10,4)|BITNUMINTR(state[1],18,3)|BITNUMINTR(state[0],18,2)|BITNUMINTR(state[1],26,1)|BITNUMINTR(state[0],26,0);
  out[5] = BITNUMINTR(state[1],1,7)|BITNUMINTR(state[0],1,6)|BITNUMINTR(state[1],9,5)|BITNUMINTR(state[0],9,4)|BITNUMINTR(state[1],17,3)|BITNUMINTR(state[0],17,2)|BITNUMINTR(state[1],25,1)|BITNUMINTR(state[0],25,0);
  out[4] = BITNUMINTR(state[1],0,7)|BITNUMINTR(state[0],0,6)|BITNUMINTR(state[1],8,5)|BITNUMINTR(state[0],8,4)|BITNUMINTR(state[1],16,3)|BITNUMINTR(state[0],16,2)|BITNUMINTR(state[1],24,1)|BITNUMINTR(state[0],24,0);
}
function f(state, key) {
  const lrg = new Array(6);
  const t1 = u(BITNUMINTL(state,31,0)|((state&0xf0000000)>>>1)|BITNUMINTL(state,4,5)|BITNUMINTL(state,3,6)|((state&0x0f000000)>>>3)|BITNUMINTL(state,8,11)|BITNUMINTL(state,7,12)|((state&0x00f00000)>>>5)|BITNUMINTL(state,12,17)|BITNUMINTL(state,11,18)|((state&0x000f0000)>>>7)|BITNUMINTL(state,16,23));
  const t2 = u(BITNUMINTL(state,15,0)|(u((state&0x0000f000)<<15))|BITNUMINTL(state,20,5)|BITNUMINTL(state,19,6)|(u((state&0x00000f00)<<13))|BITNUMINTL(state,24,11)|BITNUMINTL(state,23,12)|(u((state&0x000000f0)<<11))|BITNUMINTL(state,28,17)|BITNUMINTL(state,27,18)|(u((state&0x0000000f)<<9))|BITNUMINTL(state,0,23));
  lrg[0]=(t1>>>24)&0xff; lrg[1]=(t1>>>16)&0xff; lrg[2]=(t1>>>8)&0xff;
  lrg[3]=(t2>>>24)&0xff; lrg[4]=(t2>>>16)&0xff; lrg[5]=(t2>>>8)&0xff;
  lrg[0]^=key[0]; lrg[1]^=key[1]; lrg[2]^=key[2]; lrg[3]^=key[3]; lrg[4]^=key[4]; lrg[5]^=key[5];
  let s = u((sbox1[SBOXBIT(lrg[0]>>2)]<<28)|(sbox2[SBOXBIT(((lrg[0]&0x03)<<4)|(lrg[1]>>4))]<<24)|(sbox3[SBOXBIT(((lrg[1]&0x0f)<<2)|(lrg[2]>>6))]<<20)|(sbox4[SBOXBIT(lrg[2]&0x3f)]<<16)|(sbox5[SBOXBIT(lrg[3]>>2)]<<12)|(sbox6[SBOXBIT(((lrg[3]&0x03)<<4)|(lrg[4]>>4))]<<8)|(sbox7[SBOXBIT(((lrg[4]&0x0f)<<2)|(lrg[5]>>6))]<<4)|sbox8[SBOXBIT(lrg[5]&0x3f)]);
  s = u(BITNUMINTL(s,15,0)|BITNUMINTL(s,6,1)|BITNUMINTL(s,19,2)|BITNUMINTL(s,20,3)|BITNUMINTL(s,28,4)|BITNUMINTL(s,11,5)|BITNUMINTL(s,27,6)|BITNUMINTL(s,16,7)|BITNUMINTL(s,0,8)|BITNUMINTL(s,14,9)|BITNUMINTL(s,22,10)|BITNUMINTL(s,25,11)|BITNUMINTL(s,4,12)|BITNUMINTL(s,17,13)|BITNUMINTL(s,30,14)|BITNUMINTL(s,9,15)|BITNUMINTL(s,1,16)|BITNUMINTL(s,7,17)|BITNUMINTL(s,23,18)|BITNUMINTL(s,13,19)|BITNUMINTL(s,31,20)|BITNUMINTL(s,26,21)|BITNUMINTL(s,2,22)|BITNUMINTL(s,8,23)|BITNUMINTL(s,18,24)|BITNUMINTL(s,12,25)|BITNUMINTL(s,29,26)|BITNUMINTL(s,5,27)|BITNUMINTL(s,21,28)|BITNUMINTL(s,10,29)|BITNUMINTL(s,3,30)|BITNUMINTL(s,24,31));
  return s;
}
function desKeySetup(key, mode) {
  const key_rnd_shift=[1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
  const key_perm_c=[56,48,40,32,24,16,8,0,57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35];
  const key_perm_d=[62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,60,52,44,36,28,20,12,4,27,19,11,3];
  const key_compression=[13,16,10,23,0,4,2,27,14,5,20,9,22,18,11,3,25,7,15,6,26,19,12,1,40,51,30,36,46,54,29,39,50,44,32,47,43,48,38,55,33,52,45,41,49,35,28,31];
  const schedule = Array.from({length:16},()=>[0,0,0,0,0,0]);
  let C=0,D=0;
  for (let i=0,j=31;i<28;++i,--j) C=u(C|BITNUM(key,key_perm_c[i],j));
  for (let i=0,j=31;i<28;++i,--j) D=u(D|BITNUM(key,key_perm_d[i],j));
  for (let i=0;i<16;++i) {
    C=u((u(C<<key_rnd_shift[i])|(C>>>(28-key_rnd_shift[i])))&0xfffffff0);
    D=u((u(D<<key_rnd_shift[i])|(D>>>(28-key_rnd_shift[i])))&0xfffffff0);
    const to=(mode===DES_DECRYPT)?15-i:i;
    let j=0;
    for (;j<24;++j) schedule[to][(j/8)|0]|=BITNUMINTR(C,key_compression[j],7-(j%8));
    for (;j<48;++j) schedule[to][(j/8)|0]|=BITNUMINTR(D,key_compression[j]-27,7-(j%8));
  }
  return schedule;
}
function desCrypt(inp, schedule) {
  const state=[0,0];
  IP(state,inp);
  for (let idx=0;idx<15;++idx){ const t=state[1]; state[1]=u(f(state[1],schedule[idx])^state[0]); state[0]=t; }
  state[0]=u(f(state[1],schedule[15])^state[0]);
  const out=Buffer.alloc(8);
  InvIP(state,out);
  return out;
}
function desEcb(buf, keyBuf, mode) {
  const sched=desKeySetup(keyBuf, mode);
  const out=Buffer.alloc(buf.length);
  for (let i=0;i<buf.length;i+=8) desCrypt(buf.slice(i,i+8), sched).copy(out,i);
  return out;
}

const QRC_K1 = Buffer.from('!@#)(NHL', 'ascii'); // dec
const QRC_K2 = Buffer.from('123ZXC!@', 'ascii'); // enc
const QRC_K3 = Buffer.from('!@#)(*$%', 'ascii'); // dec

// 密文(hex 或 Buffer)-> 解密 -> zlib inflate -> QRC XML 明文;失败一律返回 ''
function decryptQrc(cipher) {
  let buf = Buffer.isBuffer(cipher) ? cipher : null;
  if (!buf) {
    const s = String(cipher || '').replace(/\s+/g, '');
    if (!s || s.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(s)) return '';
    buf = Buffer.from(s, 'hex');
  }
  if (!buf.length || buf.length % 8 !== 0) return '';
  let x = desEcb(buf, QRC_K1, DES_DECRYPT);
  x = desEcb(x, QRC_K2, DES_ENCRYPT);
  x = desEcb(x, QRC_K3, DES_DECRYPT);
  try {
    return zlib.inflateSync(x).toString('utf8');
  } catch (e) {
    try { return zlib.inflateRawSync(x).toString('utf8'); } catch (e2) { return ''; }
  }
}

// QRC XML -> 网易 yrc 逐字。无逐字时间的行(纯 LRC / 元信息)自动丢弃 -> 交前端 lrc 兜底
function qrcXmlToYrc(xml) {
  const m = String(xml || '').match(/LyricContent="([\s\S]*?)"\s*\/>/);
  const content = m ? m[1] : '';
  if (!content) return '';
  const out = [];
  content.split(/\r?\n/).forEach((line) => {
    const head = line.match(/^\[(\d+),(\d+)\]([\s\S]*)$/);
    if (!head) return;
    const body = head[3];
    const timingRe = /\((\d+),(\d+)\)/g;
    let mm, lastEnd = 0, yrcBody = '';
    while ((mm = timingRe.exec(body))) {
      // 时间标记前的即该词文本;用"切片到标记起点"而非贪婪分组,容忍歌词里出现的字面括号
      yrcBody += '(' + mm[1] + ',' + mm[2] + ',0)' + body.slice(lastEnd, mm.index);
      lastEnd = timingRe.lastIndex;
    }
    if (!yrcBody) return;
    out.push('[' + head[1] + ',' + head[2] + ']' + yrcBody);
  });
  return out.join('\n');
}

// 顶层入口:QQ 加密 qrc(hex 明文串)-> 网易 yrc;任何环节失败返回 ''(优雅降级到逐行)
function qrcHexToYrc(hex) {
  try {
    const xml = decryptQrc(hex);
    if (!xml) return '';
    return qrcXmlToYrc(xml);
  } catch (e) {
    return '';
  }
}

module.exports = { qrcHexToYrc, decryptQrc, qrcXmlToYrc };

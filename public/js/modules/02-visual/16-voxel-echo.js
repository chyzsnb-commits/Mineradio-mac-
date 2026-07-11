// ===================== 音域回响 (原名: 体素城市 Voxel City) — 频谱驱动的立方体城市 =====================
var VOXEL_PRESET_INDEX = 10;
var voxelCity = null;
function voxelCityActive() { return !!(fx && fx.preset === VOXEL_PRESET_INDEX); }

// ─────────────────────────────────────────────────────────────────────────────
// 体素地形「流体城市」= 原作 sonic-topography CustomShaderMaterial.ts 的逐行移植
//   (github.com/yin-yizhen/sonic-topography;噪声为公开标准 MIT Ashima snoise)
//   顶点:idle 海面 + 频段空间映射 + 径向节拍涟漪(原作 244-362);片元:原作 terrainFragmentShader(4-147)。
//   差异仅两处:d/涟漪距离按 uScale 归一(保留「柱体数量」设置)、vRnd 在顶点预计算传入片元。
var VOXEL_VERT = `
    uniform float uTime;
    uniform float uSubBass;
    uniform float uBass;
    uniform float uLowMid;
    uniform float uMid;
    uniform float uHighMid;
    uniform float uSmoothness;
    uniform float uDensity;
    uniform float uEnergy;
    uniform float uAmplitude;
    uniform float uScale;

    struct Ripple { vec2 pos; float time; float strength; float isActive; float rippleType; };
    uniform Ripple uRipples[10];
    uniform vec2 uHandA;
    uniform float uHandAAmt;
    uniform vec2 uHandB;
    uniform float uHandBAmt;
    uniform float uVoxGrip;

    varying float vElev;
    varying float vDist;
    varying float vRipple;
    varying float vRippleHot;
    varying float vTopFace;
    varying float vRelY;
    varying float vRnd;
    varying vec2  vUv;

    // 公开标准 MIT 简单噪声 (Ashima Arts / Stefan Gustavson)
    vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
    vec2 mod289(vec2 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
    vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }
    float snoise(vec2 v){
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
      vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute( permute( i.y + vec3(0.0,i1.y,1.0)) + i.x + vec3(0.0,i1.x,1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m; m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g;
      g.x = a0.x * x0.x + h.x * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }
    // 原作 random(CustomShaderMaterial.ts:240-242):无坐标缩放,直接 fract(sin(dot(pos,(12.9898,78.233)))*43758.5453123)
    float random(vec2 st){ return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }

    void main(){
      vUv = uv;
      vTopFace = step(0.5, normal.y);

      vec2 cell = (instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xz;
      float d = length(cell) / max(uScale, 0.001);   // 按柱体数量归一(=原作 160 网格时的 centerDist)
      vDist = d;
      float rnd = random(cell);   // 原作片元 random(vInstancePos)=顶点 random(pos2D),此处顶点预算传入片元(vRnd)
      vRnd = rnd;

      // ── 原作 CustomShaderMaterial.ts:257-263 —— idle 海面:基础噪声与方向正弦波按 uSmoothness 混合 ──
      vec2 movingPos = cell * 0.05 + vec2(uTime * 0.1, uTime * 0.05);
      float baseNoise = (snoise(movingPos) + 1.0) * 0.5;
      float wave = sin(cell.x * 0.15 + cell.y * 0.1 - uTime * 0.6) * 0.5 + 0.5;
      float globalFalloff = smoothstep(60.0, 30.0, d);
      float idleElevation = mix(baseNoise, wave, uSmoothness * 0.5 + 0.2) * 0.8 * globalFalloff;

      // ── 原作 CustomShaderMaterial.ts:265-306 —— 频段空间映射(逐行照搬)──
      // Sub-Bass:中心重、超慢起伏的大块抬升
      float subRegion = smoothstep(25.0, 0.0, d);
      float subLift = uSubBass * subRegion * 5.0;

      // Bass:成团抬升,比 sub 松散但仍聚集
      float bassNoise = snoise(cell * 0.1 - vec2(0.0, uTime * 0.2));
      float bassRegion = smoothstep(35.0, 5.0, d + bassNoise * 5.0);
      float bassLift = uBass * bassRegion * (smoothstep(0.0, 1.0, rnd + uDensity * 0.5)) * 4.0;

      // Low Mid:全图缓慢流动的波
      float lowMidNoise = snoise(cell * 0.05 + vec2(uTime * 0.1, 0.0));
      float lowMidLift = uLowMid * (lowMidNoise * 0.5 + 0.5) * 2.5;

      // Mid:河流状对角激流
      float riverFlow = sin(cell.x * 0.2 + cell.y * 0.2 + snoise(cell * 0.1) * 2.0 - uTime * 2.0);
      float midLift = uMid * max(0.0, riverFlow) * 3.0;

      // High Mid:散落的独立尖峰,强依赖柱子随机数
      float highMidRegion = smoothstep(10.0, 45.0, d);
      float highMidLift = 0.0;
      if (fract(rnd * 13.3) > 0.8) {
          highMidLift = uHighMid * highMidRegion * fract(rnd * 7.7) * 2.5;
      }

      float audioElevation = subLift + bassLift + lowMidLift + midLift + highMidLift;

      // 能量尖峰(原作 295-297)
      if (rnd > 0.99) {
          audioElevation += uEnergy * 5.0;
      }

      audioElevation *= globalFalloff;
      // 噪声门(原作 301-303):近无声时地形完全归零,不被本底噪声抬起
      audioElevation = max(0.0, audioElevation - 0.2);
      audioElevation *= uAmplitude;

      float elevation = idleElevation + audioElevation;

      // ── v9 手势:掌浪(两手各一个跟手的呼吸隆起)+ 握拳全城压平 ──
      if (uHandAAmt > 0.004) {
        float hda = length(cell - uHandA) / max(uScale, 0.001);
        float fa = 1.0 - smoothstep(0.0, 13.0, hda);
        elevation += uHandAAmt * fa * (1.5 + 0.9 * sin(uTime * 2.8 - hda * 0.55));
      }
      if (uHandBAmt > 0.004) {
        float hdb = length(cell - uHandB) / max(uScale, 0.001);
        float fb = 1.0 - smoothstep(0.0, 13.0, hdb);
        elevation += uHandBAmt * fb * (1.5 + 0.9 * sin(uTime * 2.8 - hdb * 0.55));
      }
      elevation *= mix(1.0, 0.22, clamp(uVoxGrip, 0.0, 1.0));

      // ── 原作 CustomShaderMaterial.ts:310-350 —— 节拍涟漪(逐行照搬;仅距离按 uScale 归一)──
      float rippleElevation = 0.0;
      float rippleIntensityNormal = 0.0;
      float rippleIntensityWhite = 0.0;
      for(int i = 0; i < 10; i++){
        if(uRipples[i].isActive > 0.0){
          float dist = length(cell - uRipples[i].pos) / max(uScale, 0.001);
          float timeSince = uTime - uRipples[i].time;

          float curSpeed = 15.0;
          float curWidth = 3.0;
          float curFadeDist = 15.0;
          float elevationScale = 4.0;

          if (uRipples[i].rippleType > 0.5) {
              curSpeed = 20.0;
              curWidth = 1.0;      // 更锐
              curFadeDist = 8.0;   // 更快衰减
              elevationScale = 1.0;
          }

          float waveRadius = timeSince * curSpeed;
          float dd = dist - waveRadius;
          float rippleWave = exp(-dd*dd / curWidth);
          float fade = exp(-waveRadius / curFadeDist);
          float rPulse = rippleWave * fade * uRipples[i].strength;

          rippleElevation += rPulse * elevationScale;
          if (uRipples[i].rippleType > 0.5) {
              rippleIntensityWhite += rPulse;
          } else {
              rippleIntensityNormal += rPulse;
          }
        }
      }

      elevation += rippleElevation;
      vRipple = clamp(rippleIntensityNormal, 0.0, 1.0);
      vRippleHot = clamp(rippleIntensityWhite, 0.0, 1.0);
      vElev = elevation;

      float relY = position.y + 0.5;
      vRelY = relY;
      float totalHeight = 1.0 + elevation;
      vec3 pos = position;
      pos.y = -0.5 + relY * totalHeight;
      // 原作 360-361:含 modelMatrix —— 转盘(platter)自转由父组旋转生效,涟漪局部坐标不受影响
      vec4 worldPosition = modelMatrix * instanceMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
`;
// 片元:原作 terrainFragmentShader(CustomShaderMaterial.ts:4-147)逐行移植
//   (vRnd/vDist 由顶点传入,其余命名一一对应原作;无原作以外的自加效果)
var VOXEL_FRAG = `
    uniform float uTime;
    uniform float uPresence;
    uniform float uBrilliance;
    uniform float uAir;
    uniform float uWarmth;
    uniform float uBrightness;
    uniform float uSharpness;
    uniform float uShimmer;
    uniform vec3 uBaseColor1;
    uniform vec3 uBaseColor2;
    uniform vec3 uFogColor;
    uniform vec3 uCoolCore;
    uniform vec3 uCoolEdge;
    uniform vec3 uWarmCore;
    uniform vec3 uWarmEdge;
    uniform vec3 uRippleColor;
    uniform vec3 uRippleColorHot;
    uniform float uGlowIntensity;
    uniform float uBgLight;   // 亮背景保护:1=自定义亮底(远端雾染黑改融向透明),0=默认黑底(alpha 逐位不变)

    varying float vElev;
    varying float vDist;
    varying float vRipple;
    varying float vRippleHot;
    varying float vTopFace;
    varying float vRelY;
    varying float vRnd;
    varying vec2  vUv;

    void main(){
      bool isTop = vTopFace > 0.5;
      float distFromTop = 1.0 - vRelY;

      float rnd = vRnd;
      float centerDist = vDist;

      float normElevation = clamp(vElev / 8.0, 0.0, 1.0);

      // 音色决定配色(原作 52-73):warmBlend 随 uWarmth 与离心距滑动
      float warmBlend = smoothstep(0.0, 1.0, uWarmth * 1.5 + (0.5 - centerDist/80.0));

      vec3 zoneCore = mix(uCoolCore, uWarmCore, warmBlend);
      vec3 zoneEdge = mix(uCoolEdge, uWarmEdge, warmBlend);

      vec3 targetGlow = mix(zoneCore, zoneEdge, fract(rnd * 11.0));

      float distFade = 1.0 - smoothstep(40.0, 75.0, centerDist);

      // Brightness 抬亮不覆盖自定义冷色(原作 71-73)
      vec3 brightCool = mix(uCoolCore, vec3(1.0), 0.24);
      targetGlow = mix(targetGlow, brightCool, uBrightness * 0.6);

      vec3 currentGlow = mix(uBaseColor2, targetGlow, normElevation) * uGlowIntensity * distFade;

      // 涟漪上色覆盖(原作 77-79)
      currentGlow = mix(currentGlow, uRippleColor, vRipple);
      currentGlow = mix(currentGlow, uRippleColorHot, vRippleHot);

      vec3 bodyColor = mix(uBaseColor1, uBaseColor2, vRelY * distFade);
      vec3 finalColor;

      if (isTop) {
         float topIntensity = smoothstep(0.0, 0.4, normElevation);

         // 平地闪烁的距离衰减(原作 87-89)
         float twinkleDistFalloff = smoothstep(60.0, 30.0, centerDist);
         float twinkleMultiplier = mix(twinkleDistFalloff, 1.0, smoothstep(0.01, 0.1, normElevation));

         // 静态微光(Air / Brilliance,原作 91-95)
         bool isSparkleTarget = fract(rnd * 31.0) > 0.95;
         if (isSparkleTarget && normElevation < 0.1) {
            topIntensity += uAir * 2.0 * twinkleMultiplier * uShimmer;   // air 微光·闪烁点开关
         }

         finalColor = mix(uBaseColor2, currentGlow, topIntensity);

         // 顶面描边发光(原作 99-103)
         float edgeX = smoothstep(0.05, 0.01, vUv.x) + smoothstep(0.95, 0.99, vUv.x);
         float edgeY = smoothstep(0.05, 0.01, vUv.y) + smoothstep(0.95, 0.99, vUv.y);
         float edge = min(edgeX + edgeY, 1.0);
         finalColor += currentGlow * edge * 0.8 * (topIntensity + 0.3);

         // Presence / Sharpness 闪烁(原作 105-110)
         float flashChance = smoothstep(0.3, 1.0, uPresence);
         if (fract(rnd * 53.0) > 0.98 - flashChance * 0.1) {
             float flashSync = sin(uTime * 40.0 + rnd * 100.0) * 0.5 + 0.5;
             finalColor += mix(vec3(1.0), vec3(0.5, 1.0, 1.0), rnd) * flashSync * uPresence * (1.0 + uSharpness * 2.0) * twinkleMultiplier * uShimmer;   // 顶面闪烁·闪烁点开关
         }

         // Brilliance 棱边微火花(原作 112-115)
         if (edge > 0.5 && fract(rnd * 89.0 + uTime * 2.0) > 0.98) {
             finalColor += vec3(1.0) * uBrilliance * 3.0 * twinkleMultiplier * uShimmer;   // 棱边火花·闪烁点开关
         }

      } else {
         // 侧面(原作 117-129):平滑音乐拉长竖向辉光,锐利音乐收紧到顶部
         float verticalFalloff = mix(1.0, 3.0, uSharpness);
         float sideGlow = smoothstep(0.5 / verticalFalloff, 0.0, distFromTop) * normElevation;

         if (normElevation < 0.02) sideGlow = 0.0;

         finalColor = mix(bodyColor, currentGlow, sideGlow * 1.5);

         // 顶缘光
         float rimGlow = smoothstep(0.03, 0.0, distFromTop) * normElevation;
         finalColor += currentGlow * rimGlow;
      }

      finalColor += uRippleColor * vRipple * 0.6;
      finalColor += uRippleColorHot * vRippleHot * 1.2;

      // 大气透视/背景融合(原作 135-138)
      float aerialFog = smoothstep(30.0, 65.0, centerDist);
      vec3 atmosphericColor = mix(uBaseColor1, uBaseColor2, 0.4);
      finalColor = mix(finalColor, atmosphericColor, aerialFog * 0.35);

      // 远处淡出到背景色,再靠透明度露出应用底色(原作 CustomShaderMaterial.ts:141:固定 smoothstep(55,78))
      float alphaFade = 1.0 - smoothstep(55.0, 78.0, centerDist);
      float alphaBlend = 1.0 - alphaFade;
      vec3 backdropColor = uFogColor;
      finalColor = mix(finalColor, backdropColor, alphaBlend * 0.45);

      // 亮背景保护:上面 aerialFog、alphaBlend 两处「向雾色/背景色染黑」在亮底会把远端柱子压成暗带
      //   (用户看到的右侧竖向暗噪)。改为「融向透明」——远端不再变黑,而是按染黑度衰减 alpha 透出亮背景。
      //   uBgLight=0(黑底)时乘子恒为 1,alpha 逐位 = alphaFade,与原状完全一致。
      float fogKeep = (1.0 - aerialFog * 0.35) * (1.0 - alphaBlend * 0.45);   // 未被两次雾化染黑的保留比例
      float outA = alphaFade * mix(1.0, fogKeep, uBgLight);

      gl_FragColor = vec4(finalColor, outA);
    }
`;

// ── 悬浮水晶块着色器:原作 FloatingBlockShaderMaterial(CustomShaderMaterial.ts:367-534)逐行移植 ──
//   顶点:vElevation=uPulse·20、vRippleAnim=(uPulse·0.8, uPulse·0.3)(原作 419-421);片元与地形共享调色逻辑。
var VOX_FB_VERT = `
    uniform float uTime;
    uniform float uPulse;
    uniform float uScale;

    varying float vElev;
    varying float vDist;
    varying float vRipple;
    varying float vRippleHot;
    varying float vRelY;
    varying float vRnd;
    varying vec2  vUv;

    float hash12(vec2 p){ return fract(sin(dot(p, vec2(41.31, 289.07))) * 43758.5453); }

    void main(){
      vUv = uv;

      vec2 pos2D = (instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xz;
      vRnd = hash12(pos2D * 0.37);
      vDist = length(pos2D) / max(uScale, 0.001);

      // 悬浮块用 kick 脉冲当"海拔",顶色随之点亮(原作 419-421)
      vRipple = uPulse * 0.8;
      vRippleHot = uPulse * 0.3;
      vElev = uPulse * 20.0;

      vRelY = position.y + 0.5;

      vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
`;
var VOX_FB_FRAG = `
    uniform float uTime;
    uniform float uPresence;
    uniform float uBrilliance;
    uniform float uAir;
    uniform float uWarmth;
    uniform float uBrightness;
    uniform float uSharpness;
    uniform vec3 uBaseColor1;
    uniform vec3 uBaseColor2;
    uniform vec3 uFogColor;
    uniform vec3 uCoolCore;
    uniform vec3 uCoolEdge;
    uniform vec3 uWarmCore;
    uniform vec3 uWarmEdge;
    uniform vec3 uRippleColor;
    uniform vec3 uRippleColorHot;
    uniform float uGlowIntensity;
    uniform float uBgLight;   // 亮背景保护:1=自定义亮底(远端雾染黑改融向透明),0=默认黑底(alpha 逐位不变)

    varying float vElev;
    varying float vDist;
    varying float vRipple;
    varying float vRippleHot;
    varying float vRelY;
    varying float vRnd;
    varying vec2  vUv;

    void main(){
      float rnd = vRnd;
      float centerDist = vDist;

      // 悬浮块始终激发,基础辉光跟随脉冲(vElev = uPulse·20,原作 470-471)
      float normElevation = clamp(vElev / 8.0, 0.0, 1.0);

      float warmBlend = smoothstep(0.0, 1.0, uWarmth * 1.5 + (0.5 - centerDist/80.0));
      vec3 zoneCore = mix(uCoolCore, uWarmCore, warmBlend);
      vec3 zoneEdge = mix(uCoolEdge, uWarmEdge, warmBlend);

      vec3 targetGlow = mix(zoneCore, zoneEdge, fract(rnd * 11.0));

      float distFade = 1.0 - smoothstep(40.0, 75.0, centerDist);
      vec3 brightCool = mix(uCoolCore, vec3(1.0), 0.24);
      targetGlow = mix(targetGlow, brightCool, uBrightness * 0.6);

      vec3 currentGlow = mix(uBaseColor2, targetGlow, normElevation) * uGlowIntensity * distFade;

      currentGlow = mix(currentGlow, uRippleColor, vRipple);
      currentGlow = mix(currentGlow, uRippleColorHot, vRippleHot);

      // 整块像水晶一样发光(原作 496-501)
      float topIntensity = smoothstep(0.0, 0.4, normElevation);
      float twinkleDistFalloff = smoothstep(60.0, 30.0, centerDist);
      float twinkleMultiplier = mix(twinkleDistFalloff, 1.0, smoothstep(0.01, 0.1, normElevation));

      vec3 finalColor = mix(uBaseColor2, currentGlow, topIntensity);

      // 所有面棱边发光(原作 503-507)
      float edgeX = smoothstep(0.05, 0.01, vUv.x) + smoothstep(0.95, 0.99, vUv.x);
      float edgeY = smoothstep(0.05, 0.01, vUv.y) + smoothstep(0.95, 0.99, vUv.y);
      float edge = min(edgeX + edgeY, 1.0);
      finalColor += currentGlow * edge * 0.8 * (topIntensity + 0.3);

      float flashChance = smoothstep(0.3, 1.0, uPresence);
      if (fract(rnd * 53.0) > 0.98 - flashChance * 0.1) {
          float flashSync = sin(uTime * 40.0 + rnd * 100.0) * 0.5 + 0.5;
          finalColor += mix(vec3(1.0), vec3(0.5, 1.0, 1.0), rnd) * flashSync * uPresence * (1.0 + uSharpness * 2.0) * twinkleMultiplier;
      }

      if (edge > 0.5 && fract(rnd * 89.0 + uTime * 2.0) > 0.98) {
          finalColor += vec3(1.0) * uBrilliance * 3.0 * twinkleMultiplier;
      }

      finalColor += uRippleColor * vRipple * 0.6;
      finalColor += uRippleColorHot * vRippleHot * 1.2;

      float aerialFog = smoothstep(30.0, 65.0, centerDist);
      vec3 atmosphericColor = mix(uBaseColor1, uBaseColor2, 0.4);
      finalColor = mix(finalColor, atmosphericColor, aerialFog * 0.35);

      float alphaFade = 1.0 - smoothstep(55.0, 78.0, centerDist);
      float alphaBlend = 1.0 - alphaFade;
      vec3 backdropColor = uFogColor;
      finalColor = mix(finalColor, backdropColor, alphaBlend * 0.45);

      // 亮背景保护:与地形同法,远端雾染黑改融向透明(uBgLight=0 时逐位=alphaFade)
      float fogKeep = (1.0 - aerialFog * 0.35) * (1.0 - alphaBlend * 0.45);
      float outA = alphaFade * mix(1.0, fogKeep, uBgLight);

      gl_FragColor = vec4(finalColor, outA);
    }
`;

// ── 幽灵封面 3D 层:原作 CoverShaderMaterial(CustomShaderMaterial.ts:536-635)逐行移植 ──
//   灰度低饱和 + UV 随鼓点脉动 + 噪声/径向/地平线三重遮罩;挂在转盘外的独立平面(不随转盘自转)。
var VOX_COVER_VERT = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;
var VOX_COVER_FRAG = `
    uniform sampler2D uTexture;
    uniform vec3 uThemeColor;
    uniform vec3 uFogColor;
    uniform vec2 uTextureSize;
    uniform float uTime;
    uniform float uPulse;
    uniform float uBgLight;   // 自定义亮背景保护:1=亮底(收暗区 alpha),0=默认黑底(行为不变)

    varying vec2 vUv;

    // Simplex 2D noise
    vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    float snoise(vec2 v){
      const vec4 C = vec4(0.211324865405187, 0.366025403784439,
               -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy) );
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod(i, 289.0);
      vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
      + i.x + vec3(0.0, i1.x, 1.0 ));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
        dot(x12.zw,x12.zw)), 0.0);
      m = m*m ;
      m = m*m ;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    void main() {
      // 1. UV Pumping effect with drum beat
      vec2 center = vec2(0.5, 0.5);
      vec2 puv = vUv - center;
      puv = puv * (1.0 - uPulse * 0.04);
      puv = puv + center;

      vec4 texColor = texture2D(uTexture, puv);

      // 2. Grayscale & Low Saturation
      float gray = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));

      // 2026-07-05 用户要彩色:原作 25% 饱和(75% 灰)改为全彩(遮罩/雾混合不变)
      vec3 lowSatColor = mix(vec3(gray), texColor.rgb, 1.0);

      // Brighter: Mix with pure white (1.0) to lift the darks more.
      // Adjusted from 0.65 to 0.55 so it leans more towards white light
      vec3 finalColor = mix(vec3(1.0), lowSatColor, 0.55);

      // 3. Multi-Mask Integration
      // Extremely soft radial mask to avoid any "circle" shape.
      // It starts fading immediately from the center!
      float radialMask = 1.0 - smoothstep(0.0, 0.5, length(vUv - vec2(0.5)));

      // Horizon mask (fades bottom heavily)
      float horizonMask = smoothstep(0.05, 0.45, vUv.y);

      // Noise mask (organic edge breakup)
      float n = snoise(vUv * 4.0 + uTime * 0.2) * 0.5 + 0.5;
      float noiseMask = mix(0.4, 1.0, n);

      // Increased to 0.5 for more brightness/presence (was 0.35)
      float baseOpacity = 0.5;

      float finalAlpha = baseOpacity * radialMask * horizonMask * noiseMask;

      // Pulse brightness
      finalColor *= (1.0 + uPulse * 0.8);

      // 亮背景(uBgLight=1):封面要"更清晰"而非更淡——少掺白让颜色贴回纹理原色、整体不透明度抬到 ~0.85、
      // 只用低阈软门裁掉接近纯黑的暗噪(中间调不动);uBgLight=0(黑底)时下面每一项都 mix 回原值,逐位不变。
      vec3  brightColor = mix(finalColor, lowSatColor * (1.0 + uPulse * 0.8), 0.6);   // 向纹理原色靠拢、减白雾
      float brightLuma  = dot(brightColor, vec3(0.299, 0.587, 0.114));
      float darkCut     = smoothstep(0.06, 0.22, brightLuma);                          // 只裁近纯黑,阈值低
      float brightAlpha = min(0.85, baseOpacity * radialMask * horizonMask * noiseMask * 1.7) * darkCut;
      finalColor = mix(finalColor, brightColor, uBgLight);
      finalAlpha = mix(finalAlpha, brightAlpha, uBgLight);

      gl_FragColor = vec4(finalColor, finalAlpha);
    }
`;

// 从 frequencyData(FFT2048)派生 8 频段 + 音色参数,对应原作 AudioEngine
// ── 原作 AudioEngine.ts 的逐行移植(github.com/yin-yizhen/sonic-topography)──
//   把我的 frequencyData(FFT2048,1024 bin)降采样成原作的 512 bin,再用原作
//   完全一致的 8 频段 + warmth/brightness/sharpness/smoothness/density 公式 +
//   Auto-Beat 通量节拍检测(触发涟漪)。配色暖/冷由此决定,与原版一致。
var _voxData512 = new Float32Array(512);
var _voxPrevData = new Float32Array(512);
// 体素专用音频分析器(原作 AudioEngine:512 bin、smoothing 0.8);在 source 建立处接上,节拍检测才与原作一致
var _voxAnalyser = null, _voxBytes = new Uint8Array(512);
var _voxAnalyserSrc = null, _voxAnalyserCtx = null, _voxAnalyserMain = null;   // 记录接线时的 source/audioCtx/主 analyser,音频图重建后自动重挂
// ── 原作 AudioEngine.ts:157-160:专用分析器 fftSize=1024(512 bin)·smoothing 0.8·minDecibels −75(噪声门)──
//   主分析器 smoothing=0.58、无 −75 噪声门,频段动态与通量节拍检测手感和原作不同(律动不跟旋律的根因);
//   这里惰性接上专用分析器:只挂在 source 上做分析,不改变出声链路。
//   重挂判定同时盯主 analyser:disconnectAudioGraphNodes(keepSource=true) 会保留 source 但断掉其全部输出,
//   此时 source 引用没变、我们的分析器已被断线;而 initAudio 每次都会新建主 analyser,以它为换代信号。
function _voxEnsureAnalyser() {
  if (typeof audioCtx === 'undefined' || !audioCtx || audioCtx.state === 'closed') return;
  if (typeof source === 'undefined' || !source) return;
  var mainAn = (typeof analyser !== 'undefined') ? analyser : null;
  if (_voxAnalyser && _voxAnalyserSrc === source && _voxAnalyserCtx === audioCtx && _voxAnalyserMain === mainAn) return;   // 已接且未重建
  try {
    if (_voxAnalyser && _voxAnalyserSrc) { try { _voxAnalyserSrc.disconnect(_voxAnalyser); } catch (e0) {} }
    var an = audioCtx.createAnalyser();
    an.fftSize = 1024;                  // 512 bin(原作 AudioEngine.ts:158)
    an.smoothingTimeConstant = 0.8;     // 原作 AudioEngine.ts:159
    an.minDecibels = -75;               // 原作 AudioEngine.ts:160:静音段严格归零的噪声门
    source.connect(an);                 // AnalyserNode 只取样不出声,无需连 destination
    _voxAnalyser = an; _voxAnalyserSrc = source; _voxAnalyserCtx = audioCtx; _voxAnalyserMain = mainAn;
  } catch (e) { _voxAnalyser = null; _voxAnalyserSrc = null; _voxAnalyserCtx = null; _voxAnalyserMain = null; }
}
var _voxPumped = false;   // 本 rAF 是否已在全帧率泵过音频/节拍(解耦于渲染限帧)
// animate() 顶部、渲染跳帧判断之前调用:音频分析+通量触发+自适应节拍检测按满 rAF 帧率步进。
// 原作在 useFrame(显示器帧率)里喂数据;若跟着自适应跳帧(~37fps)走,
// 帧计数冷却被拉长(Pulse 15帧→0.4s)、analyser 平滑/阈值自适应全偏 → 触发明显偏少(用户实测)。
function pumpVoxelAudioFrame() {
  _voxPumped = false;
  if (!voxelCityActive() || !voxelCity) return;
  var voxPlaying = !!(typeof audio !== 'undefined' && audio && audio.src && !audio.paused);
  if (!voxPlaying) return;   // 暂停分支留在 updateVoxelCity(释放窗按 _voxClock 走,帧率不敏感)
  updateVoxelBands();
  _voxPumped = true;
}
var _voxBandsLast = 0;   // 体素音频分析节流时间戳
var _thumbCoverEl = null, _thumbCoverLast = -1;   // 缩略图脉动:缓存元素 + 仅变化时写
var _voxPrevBrightness = 0;
var _voxSmooth = { bass:0, mid:0, treble:0, energy:0, subBass:0, lowMid:0, highMid:0, presence:0, brilliance:0, air:0, warmth:0, brightness:0, sharpness:0, smoothness:0, density:0, spectralCentroid:0 };
function _voxMakeTrig(action) {
  var t = { action: action, enabled: true, bandStart: 0, bandEnd: 16, sensitivity: 0.15, cooldown: 60, pulseStrength: 0.2,
            currentCooldown: 0, beatHold: 0, smoothedFlux: 0, prevSmoothedFlux: 0, fluxHistory: new Array(40).fill(0), fluxHistoryIndex: 0 };
  // 原作 AudioEngine.ts:46-52:Pulse 只盯真正的底鼓冲击带(bin1-2 ≈ 43-129Hz),高灵敏 + 短冷却防连发
  if (action === 'Pulse') { t.bandStart = 1; t.bandEnd = 2; t.sensitivity = 0.85; t.cooldown = 15; }
  else if (action === 'Meteor') { t.bandStart = 159; t.bandEnd = 174; t.sensitivity = 0.45; t.cooldown = 241; t.pulseStrength = 0.5; }
  // 原作 AudioEngine.ts:60-67:Snare 盯高中频/临场带(bin47-120 ≈ 2k-5kHz 的拍手/军鼓)
  else if (action === 'Snare') { t.bandStart = 47; t.bandEnd = 120; t.sensitivity = 0.6; t.cooldown = 30; t.pulseStrength = 0.3; }
  return t;
}
var _voxPulseTrig = _voxMakeTrig('Pulse'), _voxMeteorTrig = _voxMakeTrig('Meteor'), _voxSnareTrig = _voxMakeTrig('Snare');
// ── Pulse 频带自动追踪(原作 AudioEngine.ts:272-330 trackAutoPulse/evaluateAutoPulse,autoTrack 默认开)──
//   每 1s 扫最近 3s 的低 30 bin,把 Pulse 触发带锁到瞬态(diff>0.01)最强的两个 bin 上:
//   底鼓不在 bin1-2 的曲目(偏 sub 或偏 punch)也能足额触发涟漪,涟漪强弱跟着真实鼓点的通量走。
// 预分配环形缓冲复用(P3):原每帧 new Array(30) 装 3 秒窗,在满帧泵下每秒扔 ~180 个短命数组给 GC。
// 改为定容环 + 复用 data 数组:每帧只覆写 30 个元素,零新分配;窗口长度(3s)、淘汰逻辑逐位等价。
// 容量 768 = 240Hz×3.2s 上限;目标 60Hz 机实际只用 ~180,永不回绕覆盖未淘汰帧(高刷屏极端下才隐式丢 >3s 帧,可接受)。
var VOX_PULSE_TRACK_CAP = 768;
var _voxPulseTrackFrames = (function () {
  var a = new Array(VOX_PULSE_TRACK_CAP);
  for (var i = 0; i < VOX_PULSE_TRACK_CAP; i++) a[i] = { time: 0, data: new Array(30) };
  return a;
})();
var _voxPulseTrackHead = 0;    // 环形写指针(下一个要写入的槽;满环时即最旧帧位置)
var _voxPulseTrackCount = 0;   // 3 秒窗内有效帧数
var _voxLastAutoTrackTime = 0;
function _voxTrackAutoPulse(rawData, now) {
  var slot = _voxPulseTrackFrames[_voxPulseTrackHead];   // 复用槽,不新建
  slot.time = now;
  var d = slot.data;
  for (var b = 0; b < 30; b++) d[b] = rawData[b];        // 覆写 30 bin(rawData 可为非整数,用普通数组保原值)
  _voxPulseTrackHead = (_voxPulseTrackHead + 1) % VOX_PULSE_TRACK_CAP;
  if (_voxPulseTrackCount < VOX_PULSE_TRACK_CAP) _voxPulseTrackCount++;
  // 只留 3 秒窗(原作 277-280):从最旧端淘汰超窗帧,等价原 shift 循环
  while (_voxPulseTrackCount > 0) {
    var oldestIdx = (_voxPulseTrackHead - _voxPulseTrackCount + VOX_PULSE_TRACK_CAP) % VOX_PULSE_TRACK_CAP;
    if (now - _voxPulseTrackFrames[oldestIdx].time > 3000) _voxPulseTrackCount--;
    else break;
  }
  if (now - _voxLastAutoTrackTime > 1000) { _voxLastAutoTrackTime = now; _voxEvaluateAutoPulse(); }   // 每 1s 评估(原作 282-285)
}
function _voxEvaluateAutoPulse() {                        // 原作 evaluateAutoPulse(AudioEngine.ts:288-330)
  var count = _voxPulseTrackCount;
  if (count < 30) return;
  var numBins = 30, results = [];                         // 原作固定低 30 bin(data.length===30)
  var base = (_voxPulseTrackHead - count + VOX_PULSE_TRACK_CAP) % VOX_PULSE_TRACK_CAP;   // 窗内最旧帧位置
  for (var b = 0; b < numBins; b++) {                     // 每 bin 取窗内最大正向瞬态(带 1% 噪声门)
    var maxDiff = 0;
    for (var f = 1; f < count; f++) {
      var cur = _voxPulseTrackFrames[(base + f) % VOX_PULSE_TRACK_CAP].data;
      var prev = _voxPulseTrackFrames[(base + f - 1) % VOX_PULSE_TRACK_CAP].data;
      var diff = cur[b] / 255.0 - prev[b] / 255.0;
      if (diff > 0.01 && diff > maxDiff) maxDiff = diff;
    }
    results.push({ bin: b, maxDiff: maxDiff });
  }
  results.sort(function(a, b2){ return b2.maxDiff - a.maxDiff; });
  // 原作 313-317:最强瞬态太弱(前奏/静音/糊)则保持现有频带,防止锁进泥里
  if (results[0].maxDiff < 0.15) return;
  var b0 = results[0].bin, b1 = results[1].bin;
  _voxPulseTrig.bandStart = Math.min(b0, b1);
  _voxPulseTrig.bandEnd = Math.max(b0, b1);
  _voxPulseTrig.sensitivity = 0.85;                       // 原作 325:孤立频带的最优灵敏度
}
function _voxOnTrigger(strength, mode, action) {
  if (action === 'Meteor') { _voxAddMeteor(strength); return; } // 流星(+拖尾粒子),原作 MapScene 移植
  if (_voxUsePulse()) return;   // 涟漪改由 PulseCore 脉冲驱动(见 updateVoxelCity 塑形段);引擎可用时不再走通量触发,避免双涟漪。不可用时保留下方原触发
  var angle = Math.random() * Math.PI * 2;
  if (action === 'Snare') {   // 原作 MapScene.tsx:338-344:军鼓 → 更外围分布的白色锐利涟漪
    var ds = 10 + Math.random() * 35;
    _voxAddRipple(Math.cos(angle) * ds, Math.sin(angle) * ds, Math.min(strength * 3.0, 3.0), true);
    return;
  }
  // Pulse(底鼓)只出涟漪(原作 MapScene.tsx:345-360);kick 包络完全由自适应节拍检测驱动(_voxStepBeatDetector)
  if (mode === 'Kick') { var d = Math.random() * 20; _voxAddRipple(Math.cos(angle) * d, Math.sin(angle) * d, Math.min(strength * 2.0, 3.0), false); }   // 原作 MapScene.tsx:347-354:kick 靠近中心、限幅防爆
  else { var d2 = 10 + Math.random() * 25; _voxAddRipple(Math.cos(angle) * d2, Math.sin(angle) * d2, Math.min(strength * 3.0, 3.0), false); }
}
function _voxEvalTrigger(config, fluxScore) {            // 原作 evaluateTrigger 的 Auto-Beat 分支
  if (!config.enabled) return;
  config.smoothedFlux += (fluxScore - config.smoothedFlux) * 0.4;
  config.fluxHistory[config.fluxHistoryIndex] = config.smoothedFlux;
  config.fluxHistoryIndex = (config.fluxHistoryIndex + 1) % config.fluxHistory.length;
  var avgFlux = 0, fluxVariance = 0, i;
  for (i = 0; i < config.fluxHistory.length; i++) avgFlux += config.fluxHistory[i];
  avgFlux /= config.fluxHistory.length;
  for (i = 0; i < config.fluxHistory.length; i++) fluxVariance += Math.pow(config.fluxHistory[i] - avgFlux, 2);
  fluxVariance /= config.fluxHistory.length;
  var fluxStdDev = Math.sqrt(fluxVariance);
  var thresholdMultiplier = Math.max(0.1, 5.0 - config.sensitivity * 4.0);
  var adaptiveThreshold = Math.max(0.01, avgFlux + fluxStdDev * thresholdMultiplier);   // 原作 AudioEngine.ts:381:下限 0.01
  var isPeak = config.prevSmoothedFlux > adaptiveThreshold && config.prevSmoothedFlux >= config.smoothedFlux;
  if (config.beatHold > 0) { config.beatHold--; }
  else if (isPeak && config.prevSmoothedFlux - config.smoothedFlux > 0.0001) {
    // 原作 AudioEngine.ts:388-389:×30 补偿 flux 按频段 bin 数归一
    _voxOnTrigger(config.prevSmoothedFlux * 30.0 * config.pulseStrength, 'Kick', config.action);
    config.beatHold = config.cooldown;
  }
  config.prevSmoothedFlux = config.smoothedFlux;
}

// ═════ _voxBeatDetector:自适应节拍检测(原作 beatDetector.ts + kickEnvelope.ts 的逐行移植)═════
//   复杂/旋律型曲目(如 JVKE)底鼓不总在同一频带:四个候选低频窗各自累计通量得分,
//   得分领先 3% 才切换活跃窗;活跃窗通量做 90 帧均值+标准差自适应阈值的峰值检测出 onset;
//   onset 注入带噪声地板跟踪的 kick 包络。kickEnvelope 是地形低频段与悬浮块脉冲的唯一驱动
//   (原作 MapScene.tsx:381,469),Pulse/Snare 通量触发器只负责涟漪,两套并行(原作 AudioEngine.ts:486-511)。
var VOX_BEAT_WINDOWS = [                                 // 原作 beatDetector.ts:47-52:候选频率窗(bin 0-7 ≈ 0-345Hz)
  { name: 'Deep',    start: 0, end: 2 },
  { name: 'Classic', start: 1, end: 4 },
  { name: 'Punch',   start: 2, end: 6 },
  { name: 'Wide',    start: 0, end: 7 }
];
var VOX_FLUX_HISTORY_SIZE = 90;                          // 原作 beatDetector.ts:54
var VOX_WINDOW_SCORE_DECAY = 0.965;                      // 原作 beatDetector.ts:55
var VOX_FLUX_SMOOTHING = 0.35;                           // 原作 beatDetector.ts:56
var VOX_BEAT_COOLDOWN_SECONDS = 0.12;                    // 原作 beatDetector.ts:57
var VOX_BEAT_SENSITIVITY = 100;                          // 原作 DEFAULT_BEAT_DETECTOR_SENSITIVITY(beatDetector.ts:63);无设置 UI,固定原作默认值
// 原作 beatDetector.ts:65-81:严格/默认/敏感三组参数,按灵敏度 0-50-100 双段 lerp
var VOX_BEAT_STRICT    = { thresholdStdDevGain: 2.6, thresholdFloor: 0.05,  minTriggerFlux: 0.07 };
var VOX_BEAT_DEFAULTP  = { thresholdStdDevGain: 1.8, thresholdFloor: 0.028, minTriggerFlux: 0.045 };
var VOX_BEAT_SENSITIVE = { thresholdStdDevGain: 1.1, thresholdFloor: 0.016, minTriggerFlux: 0.025 };
function _voxBeatLerp(start, end, amount) { return start + (end - start) * amount; }   // 原作 beatDetector.ts:87-89
function _voxDeriveBeatParams(sensitivity) {             // 原作 deriveBeatDetectorParams(beatDetector.ts:100-115)
  var s = Math.round(Math.max(0, Math.min(100, sensitivity)));
  var lowerHalf = s <= 50 ? s / 50 : 1;
  var upperHalf = s > 50 ? (s - 50) / 50 : 0;
  var fromStrict = {
    thresholdStdDevGain: _voxBeatLerp(VOX_BEAT_STRICT.thresholdStdDevGain, VOX_BEAT_DEFAULTP.thresholdStdDevGain, lowerHalf),
    thresholdFloor:      _voxBeatLerp(VOX_BEAT_STRICT.thresholdFloor,      VOX_BEAT_DEFAULTP.thresholdFloor,      lowerHalf),
    minTriggerFlux:      _voxBeatLerp(VOX_BEAT_STRICT.minTriggerFlux,      VOX_BEAT_DEFAULTP.minTriggerFlux,      lowerHalf)
  };
  return {
    thresholdStdDevGain: _voxBeatLerp(fromStrict.thresholdStdDevGain, VOX_BEAT_SENSITIVE.thresholdStdDevGain, upperHalf),
    thresholdFloor:      _voxBeatLerp(fromStrict.thresholdFloor,      VOX_BEAT_SENSITIVE.thresholdFloor,      upperHalf),
    minTriggerFlux:      _voxBeatLerp(fromStrict.minTriggerFlux,      VOX_BEAT_SENSITIVE.minTriggerFlux,      upperHalf)
  };
}
// ── kick 包络(原作 kickEnvelope.ts 逐行移植):噪声地板跟踪 + 门限 + 呼吸微动 + onset 冲击 ──
function _voxCreateKickEnvState() {                      // 原作 kickEnvelope.ts:27-34
  return { noiseFloor: 0, kickLevel: 0, kickOnset: 0, kickEnvelope: 0 };
}
function _voxBlendForRate(rate, deltaSeconds) {          // 原作 kickEnvelope.ts:22-25
  var safeDelta = Math.max(0, isFinite(deltaSeconds) ? deltaSeconds : 0);
  return Math.max(0, Math.min(1, 1 - Math.exp(-rate * safeDelta)));
}
function _voxStepKickEnvelope(state, rawKickLevel, onset, deltaSeconds) {   // 原作 stepKickEnvelope(kickEnvelope.ts:36-66)
  var safeRaw = Math.max(0, Math.min(1, isFinite(rawKickLevel) ? rawKickLevel : 0));
  var floorRate = safeRaw > state.noiseFloor ? 1.15 : 0.35;                 // NOISE_FLOOR_ATTACK/RELEASE_RATE(kickEnvelope.ts:8-9)
  var noiseFloor = state.noiseFloor + (safeRaw - state.noiseFloor) * _voxBlendForRate(floorRate, deltaSeconds);
  var kickLevel = Math.max(0, Math.min(1, safeRaw - noiseFloor - 0.025));   // LEVEL_GATE(kickEnvelope.ts:10)
  var breathTarget = Math.min(0.11, kickLevel * 0.18);                      // MAX_BREATH/BREATH_GAIN(kickEnvelope.ts:11-12)
  var onsetTarget = onset ? Math.max(0.48, kickLevel * 0.95) : 0;           // ONSET_MIN_IMPULSE/ONSET_GAIN(kickEnvelope.ts:13-14,52-53)
  var targetEnvelope = Math.max(breathTarget, onsetTarget);
  var envelopeRate = targetEnvelope > state.kickEnvelope ? 42 : 11.5;       // ENVELOPE_ATTACK/RELEASE_RATE 固定(kickEnvelope.ts:15-16)
  var kickEnvelope = Math.max(breathTarget,
    state.kickEnvelope + (targetEnvelope - state.kickEnvelope) * _voxBlendForRate(envelopeRate, deltaSeconds));
  return { noiseFloor: noiseFloor, kickLevel: kickLevel, kickOnset: onset ? 1 : 0,
           kickEnvelope: Math.max(0, Math.min(1, kickEnvelope)) };
}
function _voxCreateBeatState() {                         // 原作 createBeatDetectorState(beatDetector.ts:146-158)
  return {
    activeWindowIndex: 1,
    windowScores: new Array(VOX_BEAT_WINDOWS.length).fill(0),
    previousWindowLevels: new Array(VOX_BEAT_WINDOWS.length).fill(0),
    fluxHistory: new Array(VOX_FLUX_HISTORY_SIZE).fill(0),
    fluxHistoryIndex: 0,
    smoothedFlux: 0,
    previousSmoothedFlux: 0,
    cooldownRemaining: 0,
    kickEnvelopeState: _voxCreateKickEnvState()
  };
}
function _voxReadWindowLevel(frequencyData, w) {         // 原作 readWindowLevel(beatDetector.ts:167-181):窗内三角加权平均电平
  var weighted = 0, weightTotal = 0;
  var center = (w.start + w.end) / 2;
  var halfWidth = Math.max(1, (w.end - w.start + 1) / 2);
  for (var b = w.start; b <= w.end; b++) {
    var distance = Math.abs(b - center);
    var weight = 0.35 + 0.65 * (1 - Math.min(1, distance / halfWidth));
    weighted += (frequencyData[b] / 255) * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? weighted / weightTotal : 0;
}
function _voxFluxStats(history) {                        // 原作 fluxStats(beatDetector.ts:183-187)
  var sum = 0, i;
  for (i = 0; i < history.length; i++) sum += history[i];
  var avg = sum / Math.max(1, history.length);
  var variance = 0;
  for (i = 0; i < history.length; i++) variance += Math.pow(history[i] - avg, 2);
  variance /= Math.max(1, history.length);
  return { avg: avg, stdDev: Math.sqrt(variance) };
}
var _voxBeatState = _voxCreateBeatState();
var _voxBeat = { kickLevel: 0, kickFlux: 0, kickThreshold: 0, kickOnset: 0, kickEnvelope: 0, kickConfidence: 0 };   // 原作 AudioEngine.ts:258-259 初值
var _voxLastKickTime = 0;
function _voxStepBeatDetector() {   // 原作 stepBeatDetector(beatDetector.ts:189-259)+ AudioEngine.ts:429-432,505-511,579-584 的接线
  // 原作 AudioEngine.ts:429-432:kickDeltaSeconds 取墙钟增量并钳制到 [0, 0.25]
  var now = performance.now();
  var safeDelta = _voxLastKickTime > 0 ? Math.max(0, Math.min(0.25, (now - _voxLastKickTime) / 1000)) : 1 / 60;
  _voxLastKickTime = now;
  var state = _voxBeatState, i;
  var params = _voxDeriveBeatParams(VOX_BEAT_SENSITIVITY);
  var windowLevels = [];
  for (i = 0; i < VOX_BEAT_WINDOWS.length; i++) windowLevels.push(_voxReadWindowLevel(_voxData512, VOX_BEAT_WINDOWS[i]));
  // 每个候选窗按自己的通量累计得分:衰减 0.965 + 窄窗聚焦加成 1/√宽度(beatDetector.ts:203-208)
  var nextScores = [];
  for (i = 0; i < state.windowScores.length; i++) {
    var wFlux = Math.max(0, windowLevels[i] - state.previousWindowLevels[i]);
    var windowWidth = VOX_BEAT_WINDOWS[i].end - VOX_BEAT_WINDOWS[i].start + 1;
    var focusBonus = 1 / Math.sqrt(windowWidth);
    nextScores.push(state.windowScores[i] * VOX_WINDOW_SCORE_DECAY + wFlux * focusBonus);
  }
  // 得分高出当前活跃窗 3% 才切换,防抖(beatDetector.ts:210-215)
  var activeWindowIndex = state.activeWindowIndex;
  for (i = 0; i < nextScores.length; i++) {
    if (nextScores[i] > nextScores[activeWindowIndex] * 1.03) activeWindowIndex = i;
  }
  var rawFlux = Math.max(0, windowLevels[activeWindowIndex] - state.previousWindowLevels[activeWindowIndex]);
  var smoothedFlux = state.smoothedFlux + (rawFlux - state.smoothedFlux) * VOX_FLUX_SMOOTHING;
  var stats = _voxFluxStats(state.fluxHistory);   // 阈值 = max(下限, 90 帧均值 + 标准差×增益)(beatDetector.ts:219-220)
  var threshold = Math.max(params.thresholdFloor, stats.avg + stats.stdDev * params.thresholdStdDevGain);
  var cooldownRemaining = Math.max(0, state.cooldownRemaining - safeDelta);
  // 峰值判定用上一帧平滑通量:过阈值 + 拐头向下 + 高于最小触发通量(beatDetector.ts:222-225)
  var isPeak = state.previousSmoothedFlux > threshold
    && state.previousSmoothedFlux >= smoothedFlux
    && state.previousSmoothedFlux >= params.minTriggerFlux;
  var onset = cooldownRemaining <= 0 && isPeak;
  var displayedFlux = onset ? state.previousSmoothedFlux : smoothedFlux;
  state.fluxHistory[state.fluxHistoryIndex] = smoothedFlux;                      // beatDetector.ts:228-230
  state.fluxHistoryIndex = (state.fluxHistoryIndex + 1) % state.fluxHistory.length;
  var nextEnvelope = _voxStepKickEnvelope(state.kickEnvelopeState, windowLevels[activeWindowIndex], onset, safeDelta || 1 / 60);   // beatDetector.ts:231-236
  var confidence = Math.max(0, Math.min(1, displayedFlux / Math.max(0.001, threshold * 2.2)));   // beatDetector.ts:237
  state.activeWindowIndex = activeWindowIndex;                                   // beatDetector.ts:240-250(原作返回新 state,此处等价原地更新)
  state.windowScores = nextScores;
  state.previousWindowLevels = windowLevels;
  state.smoothedFlux = smoothedFlux;
  state.previousSmoothedFlux = smoothedFlux;
  state.cooldownRemaining = onset ? VOX_BEAT_COOLDOWN_SECONDS : cooldownRemaining;
  state.kickEnvelopeState = nextEnvelope;
  _voxBeat.kickLevel = nextEnvelope.kickLevel;             // 原作 AudioEngine.ts:579-584:输出写入帧数据
  _voxBeat.kickFlux = displayedFlux;
  _voxBeat.kickThreshold = threshold;
  _voxBeat.kickOnset = onset ? 1 : 0;
  _voxBeat.kickEnvelope = nextEnvelope.kickEnvelope;
  _voxBeat.kickConfidence = confidence;
}

// ── AGC 响度归一层(Butterchurn/MilkDrop 血统:github.com/jberg/butterchurn src/audio/audioLevels.js)──
// 病根:绝对频谱值直接驱动柱高 → 安静/低母带电平的歌天生跳不动(Web 教程流通病)。
// 行业解法:输出 = 瞬时值 ÷ 自己的长时均值(比值信号)——任何响度的歌都在 1.0 附近波动、鼓点冲 1.5-2.5;
// 配快起慢落非对称视觉包络(WLED attack 80ms/decay 1400ms 同理)= "有力但不发急"。
var VOX_AGC_TUNING = {
  longRate30: 0.992,    // 长均值每帧保留率(30fps 基准,Butterchurn 原值;运行时按 rate^(rdt*30) 帧率补偿)
  coldRate30: 0.9,      // 冷启动前 50 帧快速收敛(Butterchurn 原值)
  coldFrames: 50,
  floor: 0.004,         // 长均值下限:低于视为静音直接归零,防除小数把噪声炸大(Butterchurn <0.001 保护同理)
  // 2026-07-05 自适应对比度(治"慢歌趴平"):映射窗不再写死,按每频段 norm 的滚动包络自适应——
  // 慢歌把 ±15% 的小起伏拉满全程,炸歌把恒响压出对比(auto-levels 思路;上一版固定 0.7/1.9 把七里香这类慢歌压死在窗底)
  envFastTau: 0.9,      // 包络朝外扩(norm 越界)的快时间常数(秒)
  envSlowTau: 8,        // 包络回缩的慢时间常数(秒)——窗口约 8s 记忆
  minSpan: 0.28,        // 窗最小宽度:防真·静态信号被无限对比放大成噪声闪
  driveMax: 1.2,
  attackTau: 0.032, releaseTau: 0.28   // 快起慢落(秒):上冲 ~32ms 跟得住鼓点,回落 ~280ms 不闪不抽
};
var _voxAgc = { on: true, long: [0, 0, 0, 0, 0, 0, 0, 0, 0], pLo: [0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55], pHi: [1.6, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6], rdt: 1 / 60, frames: 0, lastT: 0 };
function _voxAgcNorm(raw, idx, longRate) {
  var L = _voxAgc.long;
  L[idx] = L[idx] * longRate + raw * (1 - longRate);
  if (L[idx] < VOX_AGC_TUNING.floor) return 0;   // 静音地板(我们的着色器 0=平地,与 Butterchurn 输出 1 的语义不同)
  var T = VOX_AGC_TUNING, P = _voxAgc, norm = raw / L[idx];
  // 滚动包络追踪(越界快扩、慢回缩;冷启动双快收敛)→ 每首歌/每频段自己的动态范围铺满驱动量程
  var aF = 1 - Math.exp(-P.rdt / T.envFastTau), aS = 1 - Math.exp(-P.rdt / T.envSlowTau);
  if (P.frames < T.coldFrames) { var aC = 1 - Math.exp(-P.rdt / 0.25); aF = aC; aS = aC; }
  P.pLo[idx] += (norm - P.pLo[idx]) * (norm < P.pLo[idx] ? aF : aS);
  P.pHi[idx] += (norm - P.pHi[idx]) * (norm > P.pHi[idx] ? aF : aS);
  var drive = (norm - P.pLo[idx]) / Math.max(P.pHi[idx] - P.pLo[idx], T.minSpan);
  return drive < 0 ? 0 : (drive > T.driveMax ? T.driveMax : drive);
}
function _voxAsym(cur, target, aUp, aDn) { return cur + (target - cur) * (target > cur ? aUp : aDn); }
window.__voxAgcDebug = function () { return { on: _voxAgc.on, frames: _voxAgc.frames, long: _voxAgc.long.slice(), pLo: _voxAgc.pLo.slice(), pHi: _voxAgc.pHi.slice(), smooth: JSON.parse(JSON.stringify(_voxSmooth)) }; };
function updateVoxelBands() {                            // 原作 getAudioData 的逐行移植
  _voxEnsureAnalyser();   // 惰性挂上原作规格的专用分析器(音频图重建后自动重挂)
  var bin = _voxData512, prev = _voxPrevData;
  if (_voxAnalyser) {
    _voxAnalyser.getByteFrequencyData(_voxBytes);   // 专用分析器:512 bin·smoothing 0.8(与原作一致)
    for (var k = 0; k < 512; k++) bin[k] = _voxBytes[k];
  } else {
    var fd = frequencyData, fl = fd.length;          // 兜底:主分析器降采样 1024→512
    for (var k2 = 0; k2 < 512; k2++) { var a = fd[k2 * 2] || 0, b2 = (k2 * 2 + 1 < fl) ? fd[k2 * 2 + 1] : a; bin[k2] = (a + b2) * 0.5; }
  }
  _voxTrackAutoPulse(bin, performance.now());   // 原作 AudioEngine.ts:442-444:播放中每帧喂自动追踪(Pulse 频带跟着真实底鼓走)
  var binCount = 512, energySum = 0, centroidNum = 0, centroidDen = 0;
  var subBassSum = 0, bassSum = 0, lowMidSum = 0, midSum = 0, highMidSum = 0, presenceSum = 0, brillianceSum = 0, airSum = 0;
  var jumpVolatilitySum = 0, fluxPulse = 0, fluxMeteor = 0, fluxSnare = 0;
  for (var i = 0; i < binCount; i++) {
    var val = bin[i] / 255.0;
    energySum += val; centroidNum += i * val; centroidDen += val;
    var prevVal = prev[i] || 0;
    jumpVolatilitySum += Math.abs(val - prevVal);
    // 原作 AudioEngine.ts:456-472:flux 累加带 1% 噪声门(diff > 0.01)
    if (i >= _voxPulseTrig.bandStart && i <= _voxPulseTrig.bandEnd) { var dp = val - prevVal; if (dp > 0.01) fluxPulse += dp; }
    if (i >= _voxSnareTrig.bandStart && i <= _voxSnareTrig.bandEnd) { var dn = val - prevVal; if (dn > 0.01) fluxSnare += dn; }
    if (i >= _voxMeteorTrig.bandStart && i <= _voxMeteorTrig.bandEnd) { var dm = val - prevVal; if (dm > 0.01) fluxMeteor += dm; }
    prev[i] = val;
    if (i <= 1) subBassSum += val; else if (i <= 3) bassSum += val; else if (i <= 7) lowMidSum += val;
    else if (i <= 18) midSum += val; else if (i <= 46) highMidSum += val; else if (i <= 93) presenceSum += val;
    else if (i <= 186) brillianceSum += val; else if (i <= 372) airSum += val;
  }
  // 原作 AudioEngine.ts:486-496:flux 按频段 bin 数归一(每 bin 平均通量),阈值与频段宽度解耦
  _voxEvalTrigger(_voxPulseTrig, fluxPulse / Math.max(1, _voxPulseTrig.bandEnd - _voxPulseTrig.bandStart + 1));
  _voxEvalTrigger(_voxSnareTrig, fluxSnare / Math.max(1, _voxSnareTrig.bandEnd - _voxSnareTrig.bandStart + 1));
  _voxEvalTrigger(_voxMeteorTrig, fluxMeteor / Math.max(1, _voxMeteorTrig.bandEnd - _voxMeteorTrig.bandStart + 1));
  _voxStepBeatDetector();   // 原作 AudioEngine.ts:505-511:通量触发器之后步进自适应节拍检测(与涟漪触发并行,驱动 kick 包络)
  var energy = energySum / binCount;
  var subBass = subBassSum / 2, bass = bassSum / 2, lowMid = lowMidSum / 4, mid = midSum / 11,
      highMid = highMidSum / 28, presence = presenceSum / 47, brilliance = brillianceSum / 93, air = airSum / 186;
  var oldBass = (subBassSum + bassSum + lowMidSum) / 8, oldMid = (midSum + highMidSum) / 39, oldTreble = (presenceSum + brillianceSum + airSum) / 326;
  var warmth = energySum > 0 ? (subBassSum + bassSum + lowMidSum + midSum) / energySum : 0;
  var brightness = energySum > 0 ? (presenceSum + brillianceSum + airSum) / energySum : 0;
  var sharpness = Math.max(0, brightness - _voxPrevBrightness) * 10; _voxPrevBrightness = brightness;
  var smoothnessVal = Math.max(0, 1.0 - (jumpVolatilitySum / binCount) * 2.0);
  var activeThreshold = energy * 1.5, activeBands = 0;
  if (subBass > activeThreshold) activeBands++; if (bass > activeThreshold) activeBands++;
  if (lowMid > activeThreshold) activeBands++; if (mid > activeThreshold) activeBands++;
  if (highMid > activeThreshold) activeBands++; if (presence > activeThreshold) activeBands++;
  if (brilliance > activeThreshold) activeBands++; if (air > activeThreshold) activeBands++;
  var density = activeBands / 8;
  var spectralCentroid = centroidDen > 0 ? centroidNum / centroidDen : 0;
  var s = _voxSmooth, dt = energySum > 0 ? 0.15 : 0.08;   // 原作 AudioEngine.ts:558-559:hasIncomingAudio=isPlaying&&energySum>0 才用 0.15;播放中整段无声(间奏/尾奏)按 0.08 慢回落
  // ── 位移频段走 AGC 归一 + 快起慢落非对称包络(帧率无关);_voxAgc.on=false 时回退原作绝对值路径 ──
  var nowMs2 = performance.now();
  var rdt = _voxAgc.lastT > 0 ? Math.max(0.001, Math.min(0.1, (nowMs2 - _voxAgc.lastT) / 1000)) : 1 / 60;
  _voxAgc.lastT = nowMs2;
  var tSub = subBass, tBass = oldBass, tLowMid = lowMid, tMid = oldMid, tHighMid = highMid,
      tPres = presence, tBril = brilliance, tAir = air, tEnergy = energy;
  if (_voxAgc.on) {
    if (energySum > 0.5) {   // 有信号才喂长均值;整段无声不喂,防分母塌掉导致恢复播放时过冲
      var longRate = Math.pow(_voxAgc.frames < VOX_AGC_TUNING.coldFrames ? VOX_AGC_TUNING.coldRate30 : VOX_AGC_TUNING.longRate30, rdt * 30);
      _voxAgc.rdt = rdt;
      _voxAgc.frames++;
      tSub = _voxAgcNorm(subBass, 0, longRate);     tBass = _voxAgcNorm(oldBass, 1, longRate);
      tLowMid = _voxAgcNorm(lowMid, 2, longRate);   tMid = _voxAgcNorm(oldMid, 3, longRate);
      tHighMid = _voxAgcNorm(highMid, 4, longRate); tPres = _voxAgcNorm(presence, 5, longRate);
      tBril = _voxAgcNorm(brilliance, 6, longRate); tAir = _voxAgcNorm(air, 7, longRate);
      tEnergy = _voxAgcNorm(energy, 8, longRate);
    } else { tSub = tBass = tLowMid = tMid = tHighMid = tPres = tBril = tAir = tEnergy = 0; }
    var aUp = 1 - Math.exp(-rdt / VOX_AGC_TUNING.attackTau), aDn = 1 - Math.exp(-rdt / VOX_AGC_TUNING.releaseTau);
    s.subBass = _voxAsym(s.subBass, tSub, aUp, aDn);
    s.bass = _voxAsym(s.bass, tBass, aUp, aDn);
    s.lowMid = _voxAsym(s.lowMid, tLowMid, aUp, aDn);
    s.mid = _voxAsym(s.mid, tMid, aUp, aDn);
    s.highMid = _voxAsym(s.highMid, tHighMid, aUp, aDn);
    s.presence = _voxAsym(s.presence, tPres, aUp, aDn);
    s.brilliance = _voxAsym(s.brilliance, tBril, aUp, aDn);
    s.air = _voxAsym(s.air, tAir, aUp, aDn);
    s.energy = _voxAsym(s.energy, tEnergy, aUp, aDn);
  } else {
    // 原作路径(AudioEngine.ts:561-571 对称平滑)
    s.bass += (oldBass - s.bass) * dt;
    s.mid += (oldMid - s.mid) * dt;
    s.energy += (energy - s.energy) * dt;
    s.subBass += (subBass - s.subBass) * dt;
    s.lowMid += (lowMid - s.lowMid) * dt;
    s.highMid += (highMid - s.highMid) * dt;
    s.presence += (presence - s.presence) * dt;
    s.brilliance += (brilliance - s.brilliance) * dt;
    s.air += (air - s.air) * dt;
  }
  // 非位移量保持原作对称平滑(配色/波纹权重等)
  s.treble += (oldTreble - s.treble) * dt;
  s.warmth += (warmth - s.warmth) * dt; s.brightness += (brightness - s.brightness) * dt; s.sharpness += (sharpness - s.sharpness) * dt;
  s.smoothness += (smoothnessVal - s.smoothness) * dt; s.density += (density - s.density) * dt; s.spectralCentroid += (spectralCentroid - s.spectralCentroid) * dt;
}

// 涟漪环形缓冲(10),鼓点/瞬态触发后向外扩散,对应原作 ripplesRef
var _voxRipples = null, _voxRippleIdx = 0, _voxLastRippleT = -100, _voxClock = 0;
// 原作视觉释放(beginVisualRelease):暂停后 1.6s 内频段缓慢回落(dt 0.035),idle 海面继续 → 柱子慢慢变矮不塌平
var _voxWasPlaying = false, _voxVisualReleaseUntil = 0, VOX_VISUAL_RELEASE = 1.6;
function _voxAddRipple(x, z, strength, isWhite) {
  if (!_voxRipples) return;
  var r = _voxRipples[_voxRippleIdx];
  r.pos.set(x, z); r.time = _voxClock; r.strength = strength; r.isActive = 1; r.rippleType = isWhite ? 1 : 0;
  _voxRippleIdx = (_voxRippleIdx + 1) % 10;
}

// ── 悬浮水晶块状态(原作 MapScene.tsx:283-299 + groundEqSettings.ts 默认值)──
var VOX_FB_COUNT = 80;                                              // DEFAULT_FLOATING_BLOCK_COUNT
var VOX_FB_INTENSITY = 55 / 100;                                    // DEFAULT_FLOATING_BLOCK_INTENSITY 55
var VOX_FB_MIN = 0.12 + (0.75 - 0.12) * (9 / 100);                  // minSize 9 → 0.177(MapScene.tsx:474)
var VOX_FB_MAX = Math.max(VOX_FB_MIN + 0.05, 0.45 + (3.2 - 0.45) * (26 / 100));   // maxSize 26 → 1.165(MapScene.tsx:475)
var VOX_FB_SPEED_RATE = 3.0 + (36.0 - 3.0) * (77 / 100);            // speed 77 → 28.41(MapScene.tsx:470)
var _voxFbMesh = null, _voxFbUniforms = null, _voxFbBlocks = null, _voxFbPulse = 0;
var _voxFbEuler = null, _voxFbQuat = null;

// ── 流星 + 拖尾粒子(原作 MapScene.tsx 的 meteor/particle 系统逐行移植)──
var MAX_VOX_METEORS = 20, MAX_VOX_PARTICLES = 200;
var _voxMeteors = null, _voxMeteorIdx = 0, _voxLastMeteorT = -Infinity;
var _voxParticles = null, _voxParticleIdx = 0;
var _voxMeteorMesh = null, _voxMeteorMat = null, _voxParticleMesh = null, _voxParticleMat = null;
var _voxBackdrop = null;   // 亮背景暗底盘:填住体素柱阵空隙,消除亮底下露底形成的移动漏条
var _voxSeamFloor = null;  // 缝隙封底盘:柱缝在自定义背景下漏光成"转到特定角度就扫过的亮线",网格正下方铺不透明暗盘, 缝里露地面不露背景
var _voxPrevFog, _voxPrevBg, _voxPrevFar = 0, _voxFogSet = false;
// 体素相机:radius=距原点距离, height=y 高度 → 仰角=asin(height/radius);可在设置里锁定默认机位
var pinchFovDelta = 0;   // fork 侧为触控板捏合变焦全局量;Beat 侧暂无捏合入口,保持 0(_voxUpdateCamera 依赖此符号)
// 原作默认机位(sceneDefaults.ts:23-30):position(-37.5836,25.7189,92.2569) 对准原点,fov 45(App.tsx:173)。
// 折算到我们的 radius/height/azimuth 表达:radius=|position|≈102.9、height=y、azimuth=atan2(x,z)。
// 2026-07-05 用户手调机位定为默认(自由镜头固定后读出):比原版更高更远,看向中心上方 → 地形居下、封面图完整居中
var VOX_CAM_DEF_X = -85.3574, VOX_CAM_DEF_Y = 48.0129, VOX_CAM_DEF_Z = 82.7578;
var VOX_CAM_DEF_LOOKY = 18.75;   // 视线目标抬高(由用户机位 pitch -0.242 反算),0=原版看原点
var VOX_CAM_DEF_RADIUS = Math.sqrt(VOX_CAM_DEF_X * VOX_CAM_DEF_X + VOX_CAM_DEF_Y * VOX_CAM_DEF_Y + VOX_CAM_DEF_Z * VOX_CAM_DEF_Z);
var VOX_CAM_DEF_HEIGHT = VOX_CAM_DEF_Y;
// 方位角不用原版 atan2(x,z)≈-22°,改 -45°:正对幽灵封面平面(挂 [110,24,-110]、朝向 -π/4),
// 默认视角封面完整居中于地形后方(用户指定);radius/height 仍是原版低掠视,海浪条纹不会回来
var VOX_CAM_DEF_AZIMUTH = -Math.PI / 4;
var _voxCam = { radius: VOX_CAM_DEF_RADIUS, height: VOX_CAM_DEF_HEIGHT, azimuth: VOX_CAM_DEF_AZIMUTH, autoRotate: false, rotateSpeed: 0.5 };
function voxRecenterCamera() {   // 回正/K:_voxCam 归位到原作默认机位
  _voxCam.radius = VOX_CAM_DEF_RADIUS; _voxCam.height = VOX_CAM_DEF_HEIGHT; _voxCam.azimuth = VOX_CAM_DEF_AZIMUTH;
}
var _voxWhite = null, _voxTmpColorA = null;
var _voxDummyMat = null, _voxDummyPos = null, _voxDummyQuat = null, _voxDummyScale = null;
function _voxInitMeteorState() {
  if (_voxMeteors) return;
  _voxMeteors = [];
  for (var i = 0; i < MAX_VOX_METEORS; i++) _voxMeteors.push({ active:false, x:0, y:-1000, z:0, speed:0, strength:0 });
  _voxParticles = [];
  for (var j = 0; j < MAX_VOX_PARTICLES; j++) _voxParticles.push({ active:false, x:0, y:-1000, z:0, vx:0, vy:0, vz:0, life:0, maxLife:1, scale:1 });
  _voxWhite = new THREE.Color(0xffffff); _voxTmpColorA = new THREE.Color();
  _voxDummyMat = new THREE.Matrix4(); _voxDummyPos = new THREE.Vector3(); _voxDummyQuat = new THREE.Quaternion(); _voxDummyScale = new THREE.Vector3();
}
function _voxAddMeteor(strength) {              // 原作 addMeteor
  if (typeof perfTierAllowsVoxExtras === 'function' && !perfTierAllowsVoxExtras()) return;   // 性能档位:低档关闭流星
  if (!_voxMeteors) return;
  if (typeof fx !== 'undefined' && fx && fx.voxMeteors === false) return;   // 「体素流星」开关关闭
  var cooldownSeconds = _voxMeteorTrig.cooldown / 60;   // 原作 engine.meteorTrigger.cooldown/60
  if (_voxClock - _voxLastMeteorT < cooldownSeconds) return;
  _voxLastMeteorT = _voxClock;
  var idx = _voxMeteorIdx, angle = Math.random() * Math.PI * 2, dist = Math.random() * 25;
  var m = _voxMeteors[idx];
  m.active = true;
  m.x = Math.cos(angle) * dist; m.z = Math.sin(angle) * dist;
  m.y = 30 + Math.random() * 10;
  m.speed = 1.0 + Math.random() * 0.5 + (strength * 1.5);
  m.strength = strength;
  _voxMeteorIdx = (idx + 1) % MAX_VOX_METEORS;
}
function _voxSpawnParticle(x, y, z, speedMultiplier) {   // 原作 spawnParticle
  if (typeof perfTierAllowsVoxExtras === 'function' && !perfTierAllowsVoxExtras()) return;   // 性能档位:低档关闭拖尾/迸溅粒子
  if (!_voxParticles) return;
  var idx = _voxParticleIdx, p = _voxParticles[idx];
  p.active = true;
  p.x = x + (Math.random() - 0.5) * 1.5; p.y = y + (Math.random() - 0.5) * 1.5; p.z = z + (Math.random() - 0.5) * 1.5;
  p.vx = (Math.random() - 0.5) * 2.0; p.vy = Math.random() * 2.0 + speedMultiplier * 10.0; p.vz = (Math.random() - 0.5) * 2.0;
  p.life = 0; p.maxLife = 0.5 + Math.random() * 0.5; p.scale = Math.random() * 0.6 + 0.2;
  _voxParticleIdx = (idx + 1) % MAX_VOX_PARTICLES;
}
function _voxUpdateMeteors(dt, warmCoreColor) {           // 原作 useFrame 内 meteor 分支
  if (!_voxMeteorMesh) return;
  if (_voxMeteorMat) {                                     // 颜色:uWarmCore lerp 白 0.7
    var mc = _voxTmpColorA.copy(warmCoreColor).lerp(_voxWhite, 0.7);
    _voxMeteorMat.color.lerp(mc, 3.0 * dt);
  }
  var dm = _voxDummyMat, dp = _voxDummyPos, dq = _voxDummyQuat, ds = _voxDummyScale;
  for (var i = 0; i < MAX_VOX_METEORS; i++) {
    var m = _voxMeteors[i];
    if (!m.active) {
      dp.set(0, -1000, 0); ds.set(0, 0, 0);
      dm.compose(dp, dq, ds); _voxMeteorMesh.setMatrixAt(i, dm);
    } else {
      m.y -= m.speed * 60 * dt;                            // 下落(原作 m.speed*60*delta)
      if (m.y <= 0) {
        m.active = false;
        _voxAddRipple(m.x, m.z, Math.min(m.strength * 1.0, 1.2), true);   // 撞击白涟漪
        for (var pI = 0; pI < 10; pI++) _voxSpawnParticle(m.x, 0.5, m.z, m.speed * 1.5);   // 撞击迸溅
      }
      dp.set(m.x, Math.max(0, m.y), m.z); ds.set(1.5, 1.5, 1.5);
      dm.compose(dp, dq, ds); _voxMeteorMesh.setMatrixAt(i, dm);
      if (m.y > 0 && Math.random() > 0.3) _voxSpawnParticle(m.x, m.y, m.z, m.speed * 0.2);   // 拖尾
    }
  }
  _voxMeteorMesh.instanceMatrix.needsUpdate = true;
}
function _voxUpdateParticles(dt) {                         // 原作 useFrame 内 particle 分支
  if (!_voxParticleMesh) return;
  if (_voxParticleMat && _voxMeteorMat) _voxParticleMat.color.copy(_voxMeteorMat.color);
  var dm = _voxDummyMat, dp = _voxDummyPos, dq = _voxDummyQuat, ds = _voxDummyScale;
  for (var i = 0; i < MAX_VOX_PARTICLES; i++) {
    var p = _voxParticles[i];
    if (!p.active) {
      dp.set(0, -1000, 0); ds.set(0, 0, 0);
      dm.compose(dp, dq, ds); _voxParticleMesh.setMatrixAt(i, dm);
    } else {
      p.life += dt;
      if (p.life >= p.maxLife) { p.active = false; dp.set(0, -1000, 0); ds.set(0, 0, 0); }
      else {
        p.x += p.vx * dt * 10; p.y += p.vy * dt * 10; p.z += p.vz * dt * 10;
        var sc = p.scale * (1.0 - (p.life / p.maxLife));
        dp.set(p.x, p.y, p.z); ds.set(sc, sc, sc);
      }
      dm.compose(dp, dq, ds); _voxParticleMesh.setMatrixAt(i, dm);
    }
  }
  _voxParticleMesh.instanceMatrix.needsUpdate = true;
}
// R 固定后再拖动/滚轮:把当前相机位姿折算回轨道参数(radius/height/azimuth),无缝回到轨道模式继续同高度移动(对应原作 OrbitControls 状态常驻)
function voxSyncCamFromCurrentCamera() {
  if (!camera) return false;
  var vsc = (voxelCity && voxelCity.scale) ? voxelCity.scale : 1.0;
  var x = camera.position.x / vsc, y = camera.position.y / vsc, z = camera.position.z / vsc;
  var r = Math.sqrt(x * x + y * y + z * z);
  if (!isFinite(r) || r < 4) return false;
  _voxCam.radius = clampRange(r, 5, 120);   // 对齐原作 OrbitControls minDistance5/maxDistance120(MapScene.tsx:639-640)
  _voxCam.height = clampRange(y, 0.10 * _voxCam.radius, 0.995 * _voxCam.radius);
  _voxCam.azimuth = Math.atan2(x, z);
  return true;
}
function _voxUpdateCamera(dt) {                            // 原作机位:对准原点·fov45(相机永远手动,无自动公转——原作转的是转盘不是相机)
  if (!camera) return;
  if (typeof freeCamera !== 'undefined' && freeCamera && (freeCamera.active || freeCamera.locked)) {
    return;   // 自由镜头激活或 R 固定时不覆盖相机(固定后保持当前机位,不弹回初始)
  }
  if (typeof requestStageLyricCameraSnap === 'function') requestStageLyricCameraSnap(2);  // 歌词吸附相机(防抖)
  var _vsc = (voxelCity && voxelCity.scale) ? voxelCity.scale : 1.0;
  var horiz = Math.sqrt(Math.max(0, _voxCam.radius * _voxCam.radius - _voxCam.height * _voxCam.height));
  camera.up.set(0, 1, 0);
  camera.position.set(horiz * Math.sin(_voxCam.azimuth) * _vsc, _voxCam.height * _vsc, horiz * Math.cos(_voxCam.azimuth) * _vsc);
  camera.lookAt(0, VOX_CAM_DEF_LOOKY * _vsc, 0);   // 看向中心上方(用户机位构图:地形居下、封面居中)
  camera.fov = clampRange(45 + pinchFovDelta, 20, 75);
  camera.updateProjectionMatrix();
}

// 封面取色:把体素调色板缓动到当前封面调色板(stageLyrics.coverPalette);无封面默认冷蓝(原作 nocturnal)
var _voxCoverTargets = null;
function _voxUpdateCoverTargets() {
  var t = _voxCoverTargets;
  if (!t) {
    t = _voxCoverTargets = {
      coolCore: new THREE.Color(), coolEdge: new THREE.Color(),
      warmCore: new THREE.Color(), warmEdge: new THREE.Color(),
      base1: new THREE.Color(), base2: new THREE.Color(), ripple: new THREE.Color(),
      rippleAuto: new THREE.Color(), rippleHot: new THREE.Color(1, 1, 1), tmp: new THREE.Color()
    };
  }
  if (fx && fx.voxColor) {   // 自定义体素颜色:覆盖封面取色,整座城市用这个色
    if (t._lastCustom !== fx.voxColor) {
      t._lastCustom = fx.voxColor; t._lastPal = '__custom__';
      t.tmp.set(fx.voxColor);
      t.coolCore.copy(t.tmp);
      t.coolEdge.copy(t.tmp).multiplyScalar(0.65);
      t.warmCore.copy(t.tmp).multiplyScalar(1.5);
      t.warmEdge.copy(t.tmp);
      t.rippleAuto.copy(t.tmp).multiplyScalar(1.7);
      t.base2.copy(t.tmp).multiplyScalar(0.14);
      t.base1.copy(t.tmp).multiplyScalar(0.06);
    }
    _voxResolveRipple(t);
    return;
  }
  t._lastCustom = null;
  var pal = (typeof fx !== 'undefined' && fx && fx.voxCoverColor === false) ? null   // 关闭封面取色 → 走冷蓝兜底
    : ((typeof stageLyrics !== 'undefined' && stageLyrics) ? (stageLyrics.coverPalette || stageLyrics.palette) : null);
  if (t._lastPal === pal) { _voxResolveRipple(t); return; }   // 调色板引用未变(只切歌才变新对象)→ 跳过每帧 6 次 setStyle 解析
  t._lastPal = pal;
  function C(target, str, fr, fg, fb) {
    if (str) { try { target.setStyle(str); return; } catch (e) {} }
    target.setRGB(fr, fg, fb);
  }
  if (pal && pal.primary) {
    C(t.coolCore, pal.primary,   0.0, 0.3, 1.0);    // 封面主色 → 冷核(冷偏置下即城市主色)
    C(t.coolEdge, pal.secondary, 0.6, 0.2, 1.0);    // 次色 → 冷边
    C(t.warmCore, pal.highlight, 1.0, 0.2, 0.1);    // 高光 → 重低音时闪现
    C(t.warmEdge, pal.secondary, 1.0, 0.6, 0.0);
    C(t.rippleAuto, pal.highlight, 0.2, 0.9, 1.0);  // 涟漪兜底 → 高光(优先级见 _voxResolveRipple)
    C(t.tmp,      pal.shadow,    0.03, 0.05, 0.09); // 暗部 → 底色/雾
    // 钳制底色亮度:浅色封面(如杏花淡蓝近白)的"暗部"仍很亮,不钳会把整座城(含平地)刷白
    var _bmx = Math.max(t.tmp.r, t.tmp.g, t.tmp.b);
    if (_bmx > 0.10) t.tmp.multiplyScalar(0.10 / _bmx);
    t.base2.copy(t.tmp);
    t.base1.copy(t.tmp).multiplyScalar(0.5);
    // 冷核/冷边亮度上限:避免近白封面把高柱发光也刷成纯白(保留色相,压亮度)
    var _cmx = Math.max(t.coolCore.r, t.coolCore.g, t.coolCore.b);
    if (_cmx > 0.85) t.coolCore.multiplyScalar(0.85 / _cmx);
    var _emx = Math.max(t.coolEdge.r, t.coolEdge.g, t.coolEdge.b);
    if (_emx > 0.85) t.coolEdge.multiplyScalar(0.85 / _emx);
  } else {
    t.coolCore.setRGB(0.0, 0.3, 1.0); t.coolEdge.setRGB(0.6, 0.2, 1.0);
    t.warmCore.setRGB(1.0, 0.2, 0.1); t.warmEdge.setRGB(1.0, 0.6, 0.0);
    t.rippleAuto.setRGB(0.2, 0.9, 1.0);
    t.base1.setRGB(0.01, 0.02, 0.04); t.base2.setRGB(0.03, 0.05, 0.09);
  }
  _voxResolveRipple(t);
}
// 冲击波(涟漪)独立取色:用户色(fx.voxRippleColor) > 封面第二主色(coverPalette.dom2, 取色开) > 分支现状色(rippleAuto)。
// 只改缓动目标 t.ripple,每帧仍走既有 uRippleColor.lerp,不硬跳;按来源字符串缓存避免每帧 setStyle 解析
function _voxResolveRipple(t) {
  var src = (fx && fx.voxRippleColor) ? fx.voxRippleColor : '';
  if (!src && !(fx && fx.voxCoverColor === false)) {
    var p = (typeof stageLyrics !== 'undefined' && stageLyrics) ? stageLyrics.coverPalette : null;
    if (p && p.dom2) src = p.dom2;
  }
  if (!src) { t._lastRippleSrc = ''; t.ripple.copy(t.rippleAuto); t.rippleHot.setRGB(1, 1, 1); return; }   // 默认: 白色涟漪保持原版纯白
  if (t._lastRippleSrc === src) return;
  t._lastRippleSrc = src;
  try {
    t.ripple.setStyle(src);
    // 白色涟漪(军鼓/踩镲/流星类 rippleType=1)原为硬编码纯白不吃取色——"冲击波改色没反应"的主因;
    // 有明确来源色(用户色/封面次色)时白涟漪也跟色, 向白提亮 35% 保住冲击感
    t.rippleHot.copy(t.ripple).lerp(t.tmp.setRGB(1, 1, 1), 0.35);
  } catch (e) { t.ripple.copy(t.rippleAuto); t.rippleHot.setRGB(1, 1, 1); }
}

// 体素城市:背景(色/图)+ 自定义颜色 的应用(供控制台 UI 内联调用)
var _appBgTexLoader = null, _appBgToken = 0;
function _voxApplyBg() {
  if (typeof scene === 'undefined' || !scene) return;
  // app 级「背景媒体」(mp4/图片,DOM 层)优先级最高:scene.background 必须为 null 让 canvas 透明,
  // 否则体素纯色/退出体素时把黑色糊回 scene,其它预设的视频背景全被挡死(用户实测)
  if (fx.backgroundMedia || fx.backgroundImage) { scene.background = null; _appBgToken++; return; }
  var tok = ++_appBgToken;
  if (fx.voxBgImage) {
    var _bgImg = new Image();
    _bgImg.crossOrigin = 'anonymous';
    _bgImg.onload = function(){
      if (tok !== _appBgToken) return;
      try {
        var maxW = 8192; try { if (renderer && renderer.capabilities && renderer.capabilities.maxTextureSize) maxW = Math.min(maxW, renderer.capabilities.maxTextureSize); } catch (e) {}
        var iw = _bgImg.naturalWidth || _bgImg.width || 4096, ih = _bgImg.naturalHeight || _bgImg.height || 2048;
        var W = Math.min(maxW, iw), H = Math.max(1, Math.round(W * ih / iw));
        var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        var ctx = cv.getContext('2d');
        ctx.filter = 'brightness(1.55) saturate(1.25)';   // 太空类背景偏暗,提亮加饱和让其可见
        ctx.drawImage(_bgImg, 0, 0, W, H);
        var tex = new THREE.CanvasTexture(cv);
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding;
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
        try { if (renderer && renderer.capabilities) tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); } catch (e) {}
        tex.needsUpdate = true;
        scene.background = tex;
      } catch (err) { scene.background = fx.voxBgColor ? new THREE.Color(fx.voxBgColor) : null; }
    };
    _bgImg.onerror = function(){ if (tok === _appBgToken) scene.background = fx.voxBgColor ? new THREE.Color(fx.voxBgColor) : null; };
    _bgImg.src = fx.voxBgImage;
  } else if (fx.voxBgColor) {
    scene.background = new THREE.Color(fx.voxBgColor);
  } else {
    scene.background = null;
  }
}
// 全局背景系统的「图片」:体素模式下镜像进 scene.background —— 柱体缝隙露出的就是图本身, 不再漏光成亮线
// (与体素专属图片背景同一机制;不加提亮滤镜, 与 DOM 层原图观感一致)。视频背景无法镜像, 仍保持 canvas 透明让位。
var _voxGlobalBgKey = '', _voxGlobalBgTex = null;
function _voxIsGlobalMirrorTex(bg) { return !!(bg && bg.isTexture && bg.userData && bg.userData.voxGlobalMirror); }
function _voxApplyGlobalImageBg() {
  if (typeof scene === 'undefined' || !scene) return;
  if (!fx.backgroundImage || fx.backgroundMedia) return;
  if (_voxGlobalBgKey === fx.backgroundImage) {
    // 同一张图: 加载中或已就绪, 绝不重启(每帧重启会不停作废上一次加载, 镜像永远挂不上);
    // 已就绪但被外部清掉(如让位视频后又切回): 直接挂回缓存纹理
    if (_voxGlobalBgTex && _voxGlobalBgTex.userData && _voxGlobalBgTex.userData.srcKey === fx.backgroundImage && !_voxIsGlobalMirrorTex(scene.background)) {
      scene.background = _voxGlobalBgTex;
      _voxSyncGlobalBgAspect();
    }
    return;
  }
  var key = fx.backgroundImage;
  _voxGlobalBgKey = key;
  var tok = ++_appBgToken;
  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function () {
    if (tok !== _appBgToken || _voxGlobalBgKey !== key || !fx.backgroundImage) return;
    try {
      var maxW = 8192; try { if (renderer && renderer.capabilities && renderer.capabilities.maxTextureSize) maxW = Math.min(maxW, renderer.capabilities.maxTextureSize); } catch (e) {}
      var iw = img.naturalWidth || img.width || 2048, ih = img.naturalHeight || img.height || 1024;
      var W = Math.min(maxW, iw), H = Math.max(1, Math.round(W * ih / iw));
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      cv.getContext('2d').drawImage(img, 0, 0, W, H);
      var tex = new THREE.CanvasTexture(cv);
      // 不设 sRGB 编码:本渲染器 outputEncoding=Linear, 线性直通才与 DOM 层原图 1:1(设 sRGB 会被解码压暗 ~35%, 实测 100 vs 159)
      tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      tex.userData = { voxGlobalMirror: true, srcKey: key };   // r128 Texture 无自带 userData, 必须整体赋值
      tex.needsUpdate = true;
      _voxGlobalBgTex = tex;
      scene.background = tex;
      _voxSyncGlobalBgAspect();
    } catch (err) { scene.background = null; _voxGlobalBgKey = ''; }
  };
  img.onerror = function () { if (tok === _appBgToken && _voxGlobalBgKey === key) { scene.background = null; _voxGlobalBgKey = ''; } };
  img.src = key;
}
// 镜像图按 cover 语义裁切(等效 DOM 层 background-size:cover), 窗口宽高比变化时每帧跟随
function _voxSyncGlobalBgAspect() {
  var bg = (typeof scene !== 'undefined' && scene) ? scene.background : null;
  if (!(_voxIsGlobalMirrorTex(bg) && bg.image && bg.image.width)) return;
  var ca = (typeof renderer !== 'undefined' && renderer && renderer.domElement) ? (renderer.domElement.width / Math.max(1, renderer.domElement.height)) : 1;
  var ia = bg.image.width / Math.max(1, bg.image.height);
  if (ia > ca) {
    var rx = ca / ia;
    if (Math.abs(bg.repeat.x - rx) > 1e-3) { bg.repeat.set(rx, 1); bg.offset.set((1 - rx) / 2, 0); }
  } else {
    var ry = ia / ca;
    if (Math.abs(bg.repeat.y - ry) > 1e-3) { bg.repeat.set(1, ry); bg.offset.set(0, (1 - ry) / 2); }
  }
}
function voxSetColor(v) { fx.voxColor = v || ''; if (_voxCoverTargets) _voxCoverTargets._lastCustom = '__force__'; }
function voxSetRippleColor(v) { fx.voxRippleColor = v || ''; if (_voxCoverTargets) _voxCoverTargets._lastRippleSrc = '__force__'; }
function resetVoxRippleColor() { voxSetRippleColor(''); }
function setVoxRes(v) {
  fx.voxRes = /^(low|mid|high)$/.test(v) ? v : 'mid';
  var seg = document.getElementById('vox-res-seg');
  if (seg) seg.querySelectorAll('button').forEach(function(b){ b.classList.toggle('active', b.dataset.voxres === fx.voxRes); });
  if (typeof rebuildVoxelCity === 'function') rebuildVoxelCity();
  if (typeof saveVoxToggles === 'function') saveVoxToggles();
  if (typeof saveLyricLayout === 'function') saveLyricLayout();
}
// 设纯色/图片背景时必须清掉 app 级背景媒体,否则媒体优先级让位规则会把视频一直压在上面(用户实测切不回纯色)
function _voxClearAppMediaBg() {
  if ((fx.backgroundMedia || fx.backgroundImage) && typeof setCustomBackgroundMedia === 'function') setCustomBackgroundMedia(null, true);
}
function voxSetBg(v) { _voxClearAppMediaBg(); fx.voxBgColor = v || ''; fx.voxBgImage = ''; _voxApplyBg(); saveVoxBg(); }
function voxUploadBg(input) {
  var f = input && input.files && input.files[0]; if (!f) return;
  // mp4 等视频走 app 级背景媒体系统(DIY 视频格子同源);图片仍走 voxBgImage
  if (/^video\//i.test(f.type || '')) {
    if (typeof readBackgroundVideoFile === 'function') { readBackgroundVideoFile(f); }
    else if (typeof setCustomBackgroundMedia === 'function') {
      var vr = new FileReader();
      vr.onload = function (e) { setCustomBackgroundMedia({ type: 'video', src: String(e.target.result || ''), name: f.name || '', mime: f.type || '', size: f.size || 0 }); };
      vr.readAsDataURL(f);
    }
    input.value = '';
    return;
  }
  _voxClearAppMediaBg();
  var r = new FileReader();
  r.onload = function(e){
    var im = new Image();
    im.onload = function(){
      try {
        var iw = im.naturalWidth || 2048, ih = im.naturalHeight || 1024;
        var W = Math.min(2048, iw), H = Math.max(1, Math.round(W * ih / iw));   // 缩到2048再存,避免 localStorage 超限
        var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        cv.getContext('2d').drawImage(im, 0, 0, W, H);
        fx.voxBgImage = cv.toDataURL('image/jpeg', 0.85);
      } catch (err) { fx.voxBgImage = e.target.result; }
      fx.voxBgColor = ''; _voxApplyBg(); saveVoxBg();
    };
    im.onerror = function(){ fx.voxBgImage = e.target.result; fx.voxBgColor = ''; _voxApplyBg(); saveVoxBg(); };
    im.src = e.target.result;
  };
  r.readAsDataURL(f);
}
function voxClearBg() { _voxClearAppMediaBg(); fx.voxBgColor = ''; fx.voxBgImage = ''; _voxApplyBg(); saveVoxBg(); }
function _voxHexToRgb(hex) { var c = String(hex || '').replace('#',''); if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2]; var n = parseInt(c, 16); if (isNaN(n)) return ''; return (n>>16&255)+','+(n>>8&255)+','+(n&255); }
function _voxApplyPlaylistColor() { var rgb = fx.voxPlaylistColor ? _voxHexToRgb(fx.voxPlaylistColor) : ''; ['vox-playlist-host','playlist-panel'].forEach(function(id){ var el = document.getElementById(id); if (!el) return; if (rgb) el.style.setProperty('--fc-accent-rgb', rgb); else el.style.removeProperty('--fc-accent-rgb'); }); }
function voxSetPlaylistColor(v) { fx.voxPlaylistColor = v || ''; _voxApplyPlaylistColor(); saveVoxBg(); }
var VOX_BG_STORE_KEY = 'mineradio-app-bg-v1';


function saveVoxBg() { try { localStorage.setItem(VOX_BG_STORE_KEY, JSON.stringify({ image: fx.voxBgImage || '', color: fx.voxBgColor || '', playlist: fx.voxPlaylistColor || '' })); } catch (e) {} }
var VOX_TOGGLE_STORE_KEY = 'mineradio-vox-toggles-v1';
// 体素/侧边歌词布尔开关独立持久化(fx 自动存档是字段白名单制,这些键不在其中;镜像 saveVoxBg 模式)
function saveVoxToggles() { try { localStorage.setItem(VOX_TOGGLE_STORE_KEY, JSON.stringify({ autoRotate: fx.voxAutoRotate !== false, coverColor: fx.voxCoverColor !== false, meteors: fx.voxMeteors !== false, ghostCover: fx.voxGhostCover !== false, floatBlocks: fx.voxFloatBlocks !== false, shimmer: fx.voxShimmer !== false, res: fx.voxRes || 'mid' })); } catch (e) {} }
function loadVoxToggles() { try { var raw = JSON.parse(localStorage.getItem(VOX_TOGGLE_STORE_KEY) || '{}') || {}; if ('autoRotate' in raw) fx.voxAutoRotate = !!raw.autoRotate; if ('coverColor' in raw) fx.voxCoverColor = !!raw.coverColor; if ('meteors' in raw) fx.voxMeteors = !!raw.meteors; if ('ghostCover' in raw) fx.voxGhostCover = !!raw.ghostCover; if ('floatBlocks' in raw) fx.voxFloatBlocks = !!raw.floatBlocks; if ('shimmer' in raw) fx.voxShimmer = !!raw.shimmer; if (raw.res && /^(low|mid|high)$/.test(raw.res)) fx.voxRes = raw.res; } catch (e) {} }
function loadVoxBg() { try { var raw = JSON.parse(localStorage.getItem(VOX_BG_STORE_KEY) || '{}') || {}; if (raw.image) fx.voxBgImage = raw.image; if (raw.color) fx.voxBgColor = raw.color; if (raw.playlist) fx.voxPlaylistColor = raw.playlist; } catch (e) {} }

// 体素城市:把歌单面板整个 DOM 迁进视觉控制台(#fx-panel),退出体素再移回原位(只体素生效)
var _voxPlaylistHome = null;
// 粒子高级参数滑块在体素下隐藏(JS 兜底:巨型样式表里 :has 规则实测有失效情况)
function _voxToggleParticleSliders(hide) {
  ['fx-point','fx-speed','fx-twist','fx-color','fx-bloom','fx-bgfade','fx-scatter','fx-cineshake'].forEach(function (id) {
    var input = document.getElementById(id);
    var row = input && input.closest ? input.closest('.fx-slider') : null;
    if (row) row.style.display = hide ? 'none' : '';
  });
  var first = document.getElementById('fx-point');
  var firstRow = first && first.closest ? first.closest('.fx-slider') : null;
  var label = firstRow ? firstRow.previousElementSibling : null;
  if (label && label.classList && label.classList.contains('fx-section-label')) label.style.display = hide ? 'none' : '';
}
function _voxDockPlaylist(dock) {
  var pl = document.getElementById('playlist-panel');
  var fxp = document.getElementById('fx-panel');
  if (!pl || !fxp) return;
  if (dock) {
    if (typeof organizeFxPanel === 'function') organizeFxPanel();
    var host = document.getElementById('vox-playlist-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'vox-playlist-host';
      var firstPage = fxp.querySelector('[data-fx-page="playlist"]');
      if (firstPage) firstPage.appendChild(host); else fxp.appendChild(host);
    }
    if (pl.parentElement !== host) {
      _voxPlaylistHome = { parent: pl.parentElement, next: pl.nextSibling };
      host.appendChild(pl);
      _voxApplyPlaylistColor();   // 应用自定义歌单颜色(若设)
      pl.classList.add('show');   // 触发面板内容渲染 + 配合 docked CSS 常显
    }
  } else if (_voxPlaylistHome) {
    var home = _voxPlaylistHome; _voxPlaylistHome = null;
    if (typeof fxPanelTab !== 'undefined' && fxPanelTab === 'playlist' && typeof setFxPanelTab === 'function') setFxPanelTab('presets');
    if (pl.parentElement && pl.parentElement.id === 'vox-playlist-host') {
      pl.classList.remove('show');
      if (home.next && home.next.parentElement === home.parent) home.parent.insertBefore(pl, home.next);
      else home.parent.appendChild(pl);
    }
  }
}

function voxResDims() {
  var r = (fx && fx.voxRes) || 'mid';
  var g = (r === 'low') ? 120 : (r === 'high') ? 220 : 160;   // 少:小城近看 / 多:大城远看 / 中:原作
  // 体素密度纯由用户档位(voxRes)决定;性能档位/治理器一律不对网格设硬上限——性能档位管的是真性能
  // (帧率/分辨率/滤镜),不动内容密度。此约定用户已两次确认(2026-07-10 深夜批撤销钳制 + 午批 P5 复发再撤),勿再引入。
  return { grid: g, spacing: 1.05 };
}
function rebuildVoxelCity() {
  [ (voxelCity && voxelCity.mesh), _voxFbMesh, _voxMeteorMesh, _voxParticleMesh, _voxBackdrop, _voxSeamFloor, (voxelCity && voxelCity.coverPlane) ].forEach(function(m){
    if (m) { if (m.parent) m.parent.remove(m); if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }
  });
  if (voxelCity && voxelCity.platter) scene.remove(voxelCity.platter);   // 转盘组一并移除
  _voxMeteorMesh = null; _voxParticleMesh = null; _voxFbMesh = null; _voxBackdrop = null; _voxSeamFloor = null; voxelCity = null;   // 下帧按新数量重建
}
function ensureVoxelCity() {
  if (voxelCity || typeof THREE === 'undefined' || !scene) return voxelCity;
  var _vrd = voxResDims(); var gridSize = _vrd.grid, spacing = _vrd.spacing, count = gridSize * gridSize; var _vscale = gridSize / 160.0;
  var geo = new THREE.BoxGeometry(0.93, 1.0, 0.93);
  _voxRipples = [];
  for (var k = 0; k < 10; k++) _voxRipples.push({ pos: new THREE.Vector2(), time: -100, strength: 0, isActive: 0, rippleType: 0 });
  var C = THREE.Color;
  var uniforms = {
    uTime: { value: 0 }, uSubBass: { value: 0 }, uBass: { value: 0 }, uLowMid: { value: 0 }, uMid: { value: 0 },
    uHighMid: { value: 0 }, uPresence: { value: 0 }, uBrilliance: { value: 0 }, uAir: { value: 0 },
    uWarmth: { value: 0 }, uBrightness: { value: 0 }, uSharpness: { value: 0 }, uSmoothness: { value: 0 },
    uShimmer: { value: 1.0 },   // 「闪烁点」开关:1=顶面闪烁/棱边火花/air 微光全开(乘 1 与原版逐位一致),0=关
    uDensity: { value: 0 }, uEnergy: { value: 0 }, uAmplitude: { value: 1.0 },   // 原作 uAmplitude:amplitude 滑杆 50 → 1.0(MapScene.tsx:434-440)
    uRipples: { value: _voxRipples },
    uBaseColor1: { value: new C(0.01, 0.02, 0.04) }, uBaseColor2: { value: new C(0.03, 0.05, 0.09) },
    uFogColor: { value: new C(0.01, 0.02, 0.04) },   // 原作 uFogColor(远景淡出的背景色)
    uCoolCore: { value: new C(0.0, 0.3, 1.0) }, uCoolEdge: { value: new C(0.6, 0.2, 1.0) },
    uWarmCore: { value: new C(1.0, 0.2, 0.1) }, uWarmEdge: { value: new C(1.0, 0.6, 0.0) },
    uRippleColor: { value: new C(0.2, 0.9, 1.0) }, uRippleColorHot: { value: new C(1, 1, 1) }, uGlowIntensity: { value: 1.0 }, uScale: { value: _vscale },
    uBgLight: { value: 0 },
    // v9 手势:两只手的掌浪场(柱体局部 xz + 强度)+ 握拳压城
    uHandA: { value: new THREE.Vector2(0, 0) }, uHandAAmt: { value: 0 },
    uHandB: { value: new THREE.Vector2(0, 0) }, uHandBAmt: { value: 0 },
    uVoxGrip: { value: 0 }
  };
  var mat = new THREE.ShaderMaterial({ uniforms: uniforms, vertexShader: VOXEL_VERT, fragmentShader: VOXEL_FRAG, transparent: true });
  var mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  var m = new THREE.Matrix4(), i = 0, offset = (gridSize * spacing) / 2;
  for (var x = 0; x < gridSize; x++) {
    for (var z = 0; z < gridSize; z++, i++) {
      m.makeTranslation(x * spacing - offset, 0.5, z * spacing - offset);   // 原作 MapScene.tsx:209-217:整齐网格,无位置抖动
      mesh.setMatrixAt(i, m);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.visible = false;

  // 悬浮水晶块(原作 MapScene.tsx:283-299 螺旋布点 + 657-666 InstancedMesh 1×1×1)
  _voxFbUniforms = {
    uTime: { value: 0 }, uPulse: { value: 0 }, uScale: { value: _vscale },
    uPresence: { value: 0 }, uBrilliance: { value: 0 }, uAir: { value: 0 },
    uWarmth: { value: 0 }, uBrightness: { value: 0 }, uSharpness: { value: 0 },
    uBaseColor1: { value: new C(0.01, 0.02, 0.04) }, uBaseColor2: { value: new C(0.03, 0.05, 0.09) },
    uFogColor: { value: new C(0.01, 0.02, 0.04) },
    uCoolCore: { value: new C(0.0, 0.3, 1.0) }, uCoolEdge: { value: new C(0.6, 0.2, 1.0) },
    uWarmCore: { value: new C(1.0, 0.2, 0.1) }, uWarmEdge: { value: new C(1.0, 0.6, 0.0) },
    uRippleColor: { value: new C(0.2, 0.9, 1.0) }, uRippleColorHot: { value: new C(1, 1, 1) }, uGlowIntensity: { value: 1.0 },
    uBgLight: { value: 0 }
  };
  var fbMat = new THREE.ShaderMaterial({ uniforms: _voxFbUniforms, vertexShader: VOX_FB_VERT, fragmentShader: VOX_FB_FRAG, transparent: true });
  _voxFbMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), fbMat, VOX_FB_COUNT);
  _voxFbMesh.frustumCulled = false; _voxFbMesh.renderOrder = 4; _voxFbMesh.visible = false;
  _voxFbBlocks = [];
  for (var fi = 0; fi < VOX_FB_COUNT; fi++) {
    var _ring = fi / VOX_FB_COUNT;
    var _ang = _ring * Math.PI * 2 * 5.0 + Math.sin(fi * 12.9898) * 0.7;
    var _rad = 14 + ((fi * 37) % 62);
    _voxFbBlocks.push({
      x: Math.cos(_ang) * _rad * _vscale,           // 半径随柱体数量等比,与地形归一一致
      z: Math.sin(_ang) * _rad * _vscale,
      y: 6 + ((fi * 17) % 19),
      baseScale: 0.75 + ((fi * 11) % 9) * 0.05,
      phase: fi * 0.73,
      rotationSpeed: 0.18 + ((fi * 7) % 10) * 0.035
    });
  }
  _voxFbEuler = new THREE.Euler(); _voxFbQuat = new THREE.Quaternion();

  // 流星网格(box 0.4×1.2×0.4 白色)+ 拖尾粒子网格(box 0.8³ 半透),原作 MapScene
  _voxInitMeteorState();
  _voxMeteorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  _voxMeteorMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 1.2, 0.4), _voxMeteorMat, MAX_VOX_METEORS);
  _voxMeteorMesh.frustumCulled = false; _voxMeteorMesh.renderOrder = 5; _voxMeteorMesh.visible = false;
  _voxParticleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.6 });
  _voxParticleMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), _voxParticleMat, MAX_VOX_PARTICLES);
  _voxParticleMesh.frustumCulled = false; _voxParticleMesh.renderOrder = 5; _voxParticleMesh.visible = false;

  // 转盘组(原作 MapScene.tsx:644-677 <group ref={visualPlatterRef}>):地形/悬浮块/流星/粒子
  // 全部挂进同一旋转组 → 涟漪与流星的局部坐标随转盘一起转,保持一致
  var platter = new THREE.Group();
  // 亮背景暗底盘:自定义亮背景下,体素柱阵之间的空隙直接露出亮底 → 沿网格径向排成随转盘移动的亮噪漏条(黑底时空隙露黑、与暗柱融为一体、看不见)。
  // 在地形正下方铺一张与黑底同色的暗色圆盘,空隙改露暗盘 → 亮背景也复现黑底那种「空隙不可见」的观感,漏条消失。仅自定义背景时显示,黑底隐藏(逐位不变)。
  // 浅碗形(2026-07-05):纯平盘挡不住「视线与网格轴对齐(转盘 45°+k·90°)时,spacing1.05-box0.93=0.12 的柱缝叠成贯穿通缝、
  //   从地形剪影以上掠过柱顶漏出亮背景」的中央竖纹 → 外圈(0.5R 起)顶点平滑抬高成碗壁,把剪影以上的漏缝也垫暗;
  //   碗壁 alpha 渐隐随抬升高度推迟(平盘区 hn=0 时公式退化为原 smoothstep(0.62,1.0),逐位不变)。
  var _bdR = 82 * _vscale, _bdH = 10 * _vscale;   // 碗高 10:实测 16 会把暗晕轮廓顶高约 9% 屏高,10 已足够盖住剪影以上漏缝
  var _voxBackdropMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new C(0.02, 0.03, 0.05) }, uBowlH: { value: _bdH }, uBgLight: { value: 0 }, uBgColor: { value: new C(0.6, 0.66, 0.74) } },
    vertexShader: 'varying vec2 vB;varying float vH;void main(){vB=uv;vH=position.z;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    // 亮背景保护:uBgLight=1 时暗盘不再是黑块(在亮底会现成一大块黑碗=用户看到的暗块),色融向背景色、alpha 收到 0.3;uBgLight=0(黑底)逐位不变
    fragmentShader: 'varying vec2 vB;varying float vH;uniform vec3 uColor;uniform vec3 uBgColor;uniform float uBowlH;uniform float uBgLight;void main(){float r=length(vB-0.5)*2.0;float hn=clamp(vH/uBowlH,0.0,1.0);float a=(1.0-smoothstep(mix(0.62,0.85,hn),1.0,r))*0.95;a*=mix(1.0,0.3,uBgLight);vec3 col=mix(uColor,uBgColor,uBgLight);gl_FragColor=vec4(col,a);}',
    transparent: true, depthWrite: false
  });
  var _bdGeo = new THREE.PlaneGeometry(_bdR * 2.0, _bdR * 2.0, 48, 48);
  var _bdPos = _bdGeo.attributes.position;
  for (var _bv = 0; _bv < _bdPos.count; _bv++) {
    var _bx = _bdPos.getX(_bv), _bYY = _bdPos.getY(_bv);
    var _brn = Math.min(1, Math.sqrt(_bx * _bx + _bYY * _bYY) / _bdR);
    var _bt = Math.max(0, (_brn - 0.58) / 0.42);
    _bdPos.setZ(_bv, _bdH * _bt * _bt * (3.0 - 2.0 * _bt));   // smoothstep 碗壁:0.5R 内纯平,外沿抬到 _bdH(旋转 -π/2 后 local z=世界 y)
  }
  _voxBackdrop = new THREE.Mesh(_bdGeo, _voxBackdropMat);
  _voxBackdrop.rotation.x = -Math.PI / 2;   // 平铺在地形基座
  _voxBackdrop.position.y = 0.35;
  _voxBackdrop.frustumCulled = false; _voxBackdrop.renderOrder = 2; _voxBackdrop.visible = false;   // 在地形(renderOrder 4)之下;仅自定义背景显示
  platter.add(_voxBackdrop);
  // 缝隙封底盘:不透明、颜色跟随调色板(uBaseColor1/2 共享引用), 核心区 alpha=1 彻底堵住柱缝漏光,
  // 边缘按柱体同款 55→78 衰减淡出无硬边;柱体/缝隙几何一根不动, 默认黑底不显示(观感逐位不变)
  var _sfMat = new THREE.ShaderMaterial({
    uniforms: { uC1: uniforms.uBaseColor1, uC2: uniforms.uBaseColor2, uScale: uniforms.uScale },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vP; uniform vec3 uC1, uC2; uniform float uScale; void main(){ float d = length(vP) / max(uScale, 0.001); float a = 1.0 - smoothstep(55.0, 78.0, d); gl_FragColor = vec4(mix(uC1, uC2, 0.35), a); }',
    transparent: true, depthWrite: false });
  _voxSeamFloor = new THREE.Mesh(new THREE.CircleGeometry(82 * _vscale, 64), _sfMat);
  _voxSeamFloor.rotation.x = -Math.PI / 2;
  _voxSeamFloor.position.y = 0.05;
  _voxSeamFloor.frustumCulled = false; _voxSeamFloor.renderOrder = 1; _voxSeamFloor.visible = false;
  platter.add(_voxSeamFloor);
  platter.add(mesh); platter.add(_voxFbMesh); platter.add(_voxMeteorMesh); platter.add(_voxParticleMesh);
  scene.add(platter);

  // 幽灵封面 3D 层(原作 MapScene.tsx:678-696):独立平面,挂 scene(不进转盘组 → 不随转盘自转)。
  //   位置/朝向 = 原作 COVER_SCREEN_POSITION[110,24,-110] / COVER_SCREEN_ROTATION[0,-π/4,0];尺寸 140×140。
  //   纹理复用主封面 coverTex(切歌由封面管线更新 needsUpdate,零重载、无额外跨域);无封面时整层隐藏。
  var _coverUniforms = {
    uTexture: { value: (typeof coverTex !== 'undefined' && coverTex) ? coverTex : null },
    uThemeColor: { value: new C(1.0, 1.0, 1.0) },
    uFogColor: { value: new C(0.0, 0.0, 0.0) },
    uTextureSize: { value: new THREE.Vector2(512.0, 512.0) },
    uTime: { value: 0 }, uPulse: { value: 0 }, uBgLight: { value: 0 }
  };
  var _coverMat = new THREE.ShaderMaterial({ uniforms: _coverUniforms, vertexShader: VOX_COVER_VERT, fragmentShader: VOX_COVER_FRAG, transparent: true, depthWrite: false });
  var _coverPlane = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), _coverMat);
  _coverPlane.position.set(110, 24, -110);
  _coverPlane.rotation.set(0, -Math.PI / 4, 0);
  _coverPlane.frustumCulled = false; _coverPlane.renderOrder = 3; _coverPlane.visible = false;
  scene.add(_coverPlane);

  // 原作无地板:柱体透明处直接露出 app 背景(voxBg 系统 / scene.background),行为等同原作叠 HTML 背景。
  voxelCity = { mesh: mesh, uniforms: uniforms, scale: _vscale, grid: gridSize, platter: platter, coverPlane: _coverPlane, coverUniforms: _coverUniforms };
  return voxelCity;
}

// 原作 MapScene.tsx:396-412 第二级平滑后的 8 频段(motionSpeed 50 → responseRate=lerp(2.2,60,0.5)=31.1)
var _voxGround = { subBass: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, presence: 0, brilliance: 0, air: 0 };
// ── 原作频段 EQ(terrainResponse.ts:18-28 applyLowBandValue + groundEqSettings.ts:182-192 applyGroundEqBandValue,同一公式仅上限不同)──
// 默认 8 频段(groundEqSettings.ts:53 defaultGroundEqBands):subBass/bass 抬升(90→×2.44 / 92→×2.51),air 微削(48→≈×0.93),其余中性(50→原样)。
var VOX_EQ_BANDS = [90, 92, 50, 50, 50, 50, 50, 48], VOX_EQ_DEFAULT = 50;
function _voxApplyEqBand(value, bandIndex, max) {
  var delta = (VOX_EQ_BANDS[bandIndex] - VOX_EQ_DEFAULT) / VOX_EQ_DEFAULT;   // 原作 (eq-50)/50
  if (delta >= 0) return Math.max(0, Math.min(max, value * (1 + delta * 1.8)));
  var dullness = Math.abs(delta);
  return Math.max(0, Math.min(max, Math.max(0, value - dullness * 0.35) * (1 - dullness * 0.35)));
}
// ── PulseCore 律动引擎接入体素城市:所有新增塑形/涟漪系数集中于此,便于运行时调参 ──
var VOX_PULSE_TUNING = {
  // 2026-07-05 用户反馈"跳得很急":军鼓/镲注入减半、冲击呼吸放柔(配合引擎侧衰减拉长)
  snareMid: 0.18, snareHighMid: 0.12,                   // 军鼓打中频
  hatPresence: 0.08, hatBrilliance: 0.06, hatAir: 0.05, // 镲片闪高频
  swellLowMid: 0.25, swellMid: 0.25,                    // 延音铺底缓慢隆起
  pumpAmp: 0.10, punchAmp: 0.15, ampMax: 1.45,          // pump 呼吸 + punch 冲击叠加到律动敏感(总值 ≤ sens×1.55)
  rippleThresh: 0.55, rippleMinInterval: 0.18,          // 脉冲涟漪强度门限 + 两次最小间隔(秒)
  rippleGain: 1.6, rippleMax: 3.0                       // lastPulseStrength → 涟漪幅度(等比;downbeat 因 norm 已 ×1.15 自然更强)
};
var _voxPrevPulseAt = 0;   // 上一处理过的 pulseCore.lastPulseAt(检测脉冲上升沿)
function _voxUsePulse() {   // PulseCore 可用?不可用则回退体素自带 _voxBeat 检测器
  return (typeof pulseCore === 'object' && pulseCore.ready && pulseCore.source !== 'none');
}
function updateVoxelCity(dt) {
  if (!voxelCityActive()) {
    if (voxelCity && voxelCity.mesh.visible) voxelCity.mesh.visible = false;
    if (_voxFbMesh) _voxFbMesh.visible = false;
    if (_voxMeteorMesh) _voxMeteorMesh.visible = false;
    if (_voxParticleMesh) _voxParticleMesh.visible = false;
    if (_voxBackdrop) _voxBackdrop.visible = false;   // 退出体素预设必须一并隐藏暗底盘,否则自定义亮背景下它残留在其它预设里露成黑块
    if (_voxSeamFloor) _voxSeamFloor.visible = false; // 缝隙封底盘同理
    if (voxelCity && voxelCity.coverPlane) voxelCity.coverPlane.visible = false;
    if (_voxFogSet) { scene.fog = _voxPrevFog; _voxFogSet = false; _voxApplyBg(); if (_voxPrevFar && camera) { camera.far = _voxPrevFar; camera.updateProjectionMatrix(); _voxPrevFar = 0; } }   // 还原雾+far;背景按自定义重设
    if (document.body && document.body.classList.contains('vox-on')) { document.body.classList.remove('vox-on'); _voxDockPlaylist(false); _voxToggleParticleSliders(false); if (typeof applyRendererPowerMode === 'function') applyRendererPowerMode(); }   // 退出体素:歌单移回原位 + 恢复 DPR/帧率
    return;
  }
  // voxRes 可经预设快照直写(applyFxArchiveSnapshot 直改 fx.voxRes,不走 setVoxRes/rebuild)变更:与已建网格不一致时重建
  if (voxelCity && voxelCity.grid !== voxResDims().grid) rebuildVoxelCity();
  var vc = ensureVoxelCity(); if (!vc) return;
  vc.mesh.visible = true;
  if (_voxFbMesh) _voxFbMesh.visible = !(fx && fx.voxFloatBlocks === false);   // 「悬浮方块」开关(蓝色方块+白色线框方块)
  if (document.body && !document.body.classList.contains('vox-on')) { document.body.classList.add('vox-on'); _voxDockPlaylist(true); _voxToggleParticleSliders(true); _voxApplyBg(); if (typeof applyRendererPowerMode === 'function') applyRendererPowerMode(); }   // 体素预设:歌单迁进视觉控制台 + 应用自定义背景 + 触发 DPR/限帧重算
  var fdt = dt || 0.016;
  _voxClock += fdt;     // 原作:时钟始终推进(暂停时 idle 海面继续起伏,不冻结)
  // 转盘自转(原作 MapScene.tsx:366-369 + sceneDefaults.ts:19-21 rotationSpeed 0.15):旋转整组(地形+悬浮块+流星+粒子),涟漪/流星局部坐标不受影响。
  // 「自转速度」滑块 = 转盘转速倍率:voxRotateSpeed 默认 0.5 → 0.15 rad/s(正好原作原速);开关(voxAutoRotate)关闭时转盘完全静止。
  if (vc.platter && fx && fx.voxAutoRotate) {
    var _rs = (fx.voxRotateSpeed != null ? fx.voxRotateSpeed : 0.5);
    // 鼠标拖拽/手势握拳转视角期间自转减速到 35%,不与手动转镜抢方向
    var _rd = ((typeof _voxDrag !== 'undefined' && _voxDrag.active) || vc.uniforms.uVoxGrip.value > 0.5) ? 0.35 : 1;
    vc.platter.rotation.y += 0.15 * (_rs / 0.5) * _rd * fdt;
  }
  var voxPlaying = !!(typeof audio !== 'undefined' && audio && audio.src && !audio.paused);
  if (_voxWasPlaying && !voxPlaying) _voxVisualReleaseUntil = _voxClock + VOX_VISUAL_RELEASE;   // 播放→暂停:开启 1.6s 视觉释放窗(原作 beginVisualRelease)
  _voxWasPlaying = voxPlaying;
  if (voxPlaying) {
    if (!_voxPumped) updateVoxelBands();   // 已在 animate 顶部全帧率泵过则跳过;含原作节拍检测 → 触发涟漪;dt=0.15
  } else {
    // 原作 getAudioData 暂停分支:频段目标=0,释放窗内 dt=0.035(慢回落)否则 0.08;柱子缓缓变矮、不塌平
    var _rel = _voxClock < _voxVisualReleaseUntil, _d = _rel ? 0.035 : 0.08, _sm = _voxSmooth;
    // 原作暂停:bin→0 → jumpVolatility→0 → smoothnessVal→1(AudioEngine.ts:541),故 smoothness 目标趋向 1(波纹权重满、idle 海面更平滑),其余频段趋向 0
    for (var _k in _sm) { var _kt = (_k === 'smoothness') ? 1 : 0; _sm[_k] += (_kt - _sm[_k]) * _d; }
    // 原作 AudioEngine.ts:497-505:暂停时 bin 缓降(释放窗内 ×0.94,否则归零)后仍步进节拍检测 → kick 包络自然释放
    for (var _pz = 0; _pz < 512; _pz++) { _voxData512[_pz] = _rel ? Math.floor(_voxData512[_pz] * 0.94) : 0; _voxPrevData[_pz] = 0; }
    _voxStepBeatDetector();
  }
  var s = _voxSmooth, u = vc.uniforms;
  u.uTime.value = _voxClock;
  // 是否自定义亮背景:体素专属背景(voxBg*)或全局背景系统(纯色/图片/视频)——此前漏了全局路径, 亮图当底时城区糊成大黑块
  var _voxBg = !!(fx && (fx.voxBgColor || fx.voxBgImage || fx.backgroundColorCustom || fx.backgroundImage || fx.backgroundMedia));
  if (u.uBgLight) u.uBgLight.value = _voxBg ? 1 : 0;   // 地形:亮背景时远端雾染黑改融向透明,消除右侧竖向暗噪
  if (_voxBackdrop) {
    _voxBackdrop.visible = _voxBg;   // 暗底盘仅自定义亮背景时显示,消除露底漏条;黑底隐藏(观感逐位不变)
    if (_voxSeamFloor) _voxSeamFloor.visible = _voxBg;   // 缝隙封底盘同门槛:柱缝露地面不露背景, 转动不再扫出亮线
    var _bdu = _voxBackdrop.material && _voxBackdrop.material.uniforms;
    if (_bdu && _bdu.uBgLight) {
      _bdu.uBgLight.value = _voxBg ? 1 : 0;   // 亮背景时暗盘不再是黑块(避免在亮底现成大黑碗)
      if (fx && fx.voxBgColor) { _bdu.uBgColor.value.set(fx.voxBgColor); }   // 纯色背景:暗盘融向该色 → 缝隙露盘=露背景,无黑块无缝
      else { _bdu.uBgColor.value.setRGB(0.6, 0.66, 0.74); }                  // 图片背景无单色:取中性浅色兜底,低 alpha 软垫
    }
  }

  // ── kick 包络:PulseCore 可用时取 pulseCore.kick(同 clamp/除数,数值范围与原状一致,只是时机/权重更准),否则回退 _voxBeat(原作 MapScene.tsx:381-388 → terrainResponse.ts:76-105 deriveKickFollowLowBands)──
  var VP = VOX_PULSE_TUNING, usePulse = _voxUsePulse();
  var _sk = Math.max(0, Math.min(0.75, usePulse ? pulseCore.kick : _voxBeat.kickEnvelope));   // safeKick:钳到 MAX_KICK_DEFORM 0.75(terrainResponse.ts:88)
  var _kn = _sk / 0.75;                                           // normalizedKick(terrainResponse.ts:89)

  // ── 低频段目标 = 频段能量×基础增益 + kick 包络×kick 增益,过原作低频 EQ 再限幅(原作 terrainResponse.ts:92-105 deriveKickFollowLowBands 内 applyLowBandValue)──
  var _tSubBass = _voxApplyEqBand(s.subBass * 0.22 + _kn * 1.28, 0, 1.2);
  var _tBass = _voxApplyEqBand(s.bass * 0.2 + _kn * 1.15, 1, 1.15);
  // ── 中/高频段先过原作 EQ(applyGroundEqBandValue,默认中性除 air 微削,上限 1),再叠 PulseCore 塑形(军鼓打中频、镲片闪高频、swell 铺底);EQ 在前、注入在后(原作 MapScene.tsx:390-395)──
  var _tLowMid = _voxApplyEqBand(s.lowMid, 2, 1), _tMid = _voxApplyEqBand(s.mid, 3, 1), _tHighMid = _voxApplyEqBand(s.highMid, 4, 1),
      _tPresence = _voxApplyEqBand(s.presence, 5, 1), _tBrilliance = _voxApplyEqBand(s.brilliance, 6, 1), _tAir = _voxApplyEqBand(s.air, 7, 1);
  if (usePulse) {
    _tLowMid = Math.min(1.2, _tLowMid + pulseCore.swell * VP.swellLowMid);
    _tMid = Math.min(1.2, _tMid + pulseCore.snare * VP.snareMid + pulseCore.swell * VP.swellMid);
    _tHighMid = Math.min(1.2, _tHighMid + pulseCore.snare * VP.snareHighMid);
    _tPresence = Math.min(1.2, _tPresence + pulseCore.hat * VP.hatPresence);
    _tBrilliance = Math.min(1.2, _tBrilliance + pulseCore.hat * VP.hatBrilliance);
    _tAir = Math.min(1.2, _tAir + pulseCore.hat * VP.hatAir);
  }

  // ── 涟漪改由脉冲驱动:检测 pulseCore.lastPulseAt 上升沿,强度过门 + 最小间隔后按 lastPulseStrength 等比出涟漪(downbeat 因 norm 已 ×1.15 自然更强);不可用时保留 _voxOnTrigger 的原通量触发 ──
  if (usePulse && pulseCore.lastPulseAt !== _voxPrevPulseAt) {
    _voxPrevPulseAt = pulseCore.lastPulseAt;
    if (pulseCore.lastPulseStrength >= VP.rippleThresh && (_voxClock - _voxLastRippleT) >= VP.rippleMinInterval) {
      _voxLastRippleT = _voxClock;
      var _rpAng = Math.random() * Math.PI * 2, _rpWhite = pulseCore.lastPulseKind !== 'low', _rpDist = _rpWhite ? (10 + Math.random() * 35) : (Math.random() * 20);   // low→中心彩涟漪(仿原 Kick),body/snap→外围白涟漪(仿原 Snare)
      _voxAddRipple(Math.cos(_rpAng) * _rpDist, Math.sin(_rpAng) * _rpDist, Math.min(pulseCore.lastPulseStrength * VP.rippleGain, VP.rippleMax), _rpWhite);
    }
  }

  // ── 第二级平滑(原作 MapScene.tsx:377-404):motionSpeed 50 → blend = 1-exp(-31.1·dt)──
  var g = _voxGround, _gb = 1 - Math.exp(-31.1 * fdt);
  g.subBass += (_tSubBass - g.subBass) * _gb;
  g.bass += (_tBass - g.bass) * _gb;
  g.lowMid += (_tLowMid - g.lowMid) * _gb;
  g.mid += (_tMid - g.mid) * _gb;
  g.highMid += (_tHighMid - g.highMid) * _gb;
  g.presence += (_tPresence - g.presence) * _gb;
  g.brilliance += (_tBrilliance - g.brilliance) * _gb;
  g.air += (_tAir - g.air) * _gb;

  // 律动敏感(用户可调,狂野↔平缓):按原作 amplitude 滑杆的位置作用在 uAmplitude 上——
  // 原作 CustomShaderMaterial.ts:301-306 是先过 −0.2 噪声门再 ×uAmplitude(MapScene.tsx:434-445)。
  // 之前乘在频段值上=门前放大:调小时小律动整段被门吃掉、调大时本底噪声也过门,大小律动层次被抹平。
  var sens = (fx && fx.voxSensitivity != null) ? fx.voxSensitivity : 1;
  if (sens > 1) sens = Math.pow(sens, 1.35);   // 滑杆过半指数放大(原作 amplitude>50 有 1→15× 段;此处温和版:2.5 → ~3.4×)
  // pump 呼吸 + punch 冲击叠加到律动敏感(总值钳到 sens×ampMax);PulseCore 不可用时退回纯 sens,滑块 sens 仍为基准、语义不变
  u.uAmplitude.value = usePulse ? Math.min(sens * VP.ampMax, sens * (1 + pulseCore.pump * VP.pumpAmp + pulseCore.punch * VP.punchAmp)) : sens;
  u.uSubBass.value = g.subBass; u.uBass.value = g.bass; u.uLowMid.value = g.lowMid; u.uMid.value = g.mid;
  u.uHighMid.value = g.highMid; u.uPresence.value = g.presence; u.uBrilliance.value = g.brilliance; u.uAir.value = g.air;
  u.uEnergy.value = s.energy;
  // 原作 MapScene.tsx:456-457:warmth/brightness 由二级平滑后的频段推导
  var lo = g.subBass + g.bass + g.lowMid + g.mid, hi = g.presence + g.brilliance + g.air, den = Math.max(0.001, lo + hi);
  u.uWarmth.value = clamp01(lo / den);
  u.uBrightness.value = clamp01(hi / den);
  u.uSharpness.value = s.sharpness; u.uSmoothness.value = s.smoothness; u.uDensity.value = s.density;
  if (u.uShimmer) u.uShimmer.value = (fx && fx.voxShimmer === false) ? 0 : 0.65;   // 「闪烁点」开关:关=0;开=0.65(原 1.0 满档太密,用户要求压上限——顶面闪烁/棱边火花/air 微光三处同缩)

  // 封面取色:体素调色板缓动到当前封面色(切歌平滑过渡;无封面=冷蓝兜底)
  _voxUpdateCoverTargets();
  var _cl = Math.min(1, 2.5 * fdt), _ct = _voxCoverTargets;
  u.uCoolCore.value.lerp(_ct.coolCore, _cl);
  u.uCoolEdge.value.lerp(_ct.coolEdge, _cl);
  u.uWarmCore.value.lerp(_ct.warmCore, _cl);
  u.uWarmEdge.value.lerp(_ct.warmEdge, _cl);
  u.uBaseColor1.value.lerp(_ct.base1, _cl);
  u.uBaseColor2.value.lerp(_ct.base2, _cl);
  u.uRippleColor.value.lerp(_ct.ripple, _cl);
  if (u.uRippleColorHot) u.uRippleColorHot.value.lerp(_ct.rippleHot, _cl);
  u.uFogColor.value.copy(u.uBaseColor1.value);   // 原作主题的 uFogColor≈uBaseColor1;封面主题下取 base1

  // ── 幽灵封面 3D 层每帧更新(原作 MapScene.tsx:590-593 脉动 + 684-693 主题/雾色)──
  //   显隐:有封面(uHasCover)且「封面图」开关开着(voxGhostCover,独立于配色取色开关)才显示;每帧只改 uniform,不重建纹理。
  if (vc.coverPlane && vc.coverUniforms) {
    var _cvShow = !!(typeof uniforms !== 'undefined' && uniforms.uHasCover && uniforms.uHasCover.value > 0.5) && !(fx && fx.voxGhostCover === false);
    vc.coverPlane.visible = _cvShow;
    if (_cvShow) {
      var _cu = vc.coverUniforms;
      if (typeof coverTex !== 'undefined' && coverTex) _cu.uTexture.value = coverTex;   // 复用主封面纹理(切歌由封面管线更新)
      _cu.uTime.value = _voxClock;
      _cu.uPulse.value = _sk;   // kick 包络(PulseCore 可用取 pulseCore.kick),同塑形段 usePulse 语义
      _cu.uThemeColor.value.copy(u.uWarmCore.value).lerp(u.uCoolCore.value, 0.5);   // 原作 warmCore.lerp(coolCore,0.5)
      _cu.uFogColor.value.copy(u.uFogColor.value);   // 原作 uFogColor
      if (_cu.uBgLight) _cu.uBgLight.value = _voxBg ? 1 : 0;   // 自定义亮背景时收暗区 alpha,消除右侧竖向暗噪带(口径与地形一致, 含全局背景系统)
      // 亮背景: 幽灵封面切加色混合 —— 光影只加亮不压暗, 深色封面不再在亮图上糊成一大片黑纱;
      // 黑底(默认)保持普通混合, 行为逐位不变
      var _cvBlend = _voxBg ? THREE.AdditiveBlending : THREE.NormalBlending;
      if (vc.coverPlane.material.blending !== _cvBlend) vc.coverPlane.material.blending = _cvBlend;
    }
  }

  // ── 悬浮水晶块每帧更新(原作 MapScene.tsx:466-520)──
  if (_voxFbMesh && _voxFbUniforms) {
    var _rawPulse = clamp01(_voxBeat.kickEnvelope);   // 原作 MapScene.tsx:469:rawPulse = clamp(data.kickEnvelope, 0, 1)
    _voxFbPulse += (_rawPulse - _voxFbPulse) * (1 - Math.exp(-VOX_FB_SPEED_RATE * fdt));   // speedRate 28.41(speed 77)
    var _fbPulse = _voxFbPulse;
    var _sizeMix = Math.max(0, Math.min(1, _fbPulse * (0.5 + VOX_FB_INTENSITY * 1.7)));    // 原作 476
    var _pulseScale = VOX_FB_MIN + (VOX_FB_MAX - VOX_FB_MIN) * _sizeMix;                   // 原作 477:lerp(min,max,sizeMix)
    var fu = _voxFbUniforms;
    fu.uTime.value = _voxClock;
    fu.uPulse.value = _sizeMix;                                                            // 原作 482:uPulse = sizeMix
    // 与地形共用同一套音色/主题 uniform(原作 484-499:两材质 lerp 到同一主题)
    fu.uWarmth.value = u.uWarmth.value; fu.uBrightness.value = u.uBrightness.value; fu.uSharpness.value = u.uSharpness.value;
    fu.uPresence.value = u.uPresence.value; fu.uBrilliance.value = u.uBrilliance.value; fu.uAir.value = u.uAir.value;
    fu.uGlowIntensity.value = u.uGlowIntensity.value;
    fu.uBaseColor1.value.copy(u.uBaseColor1.value); fu.uBaseColor2.value.copy(u.uBaseColor2.value);
    fu.uFogColor.value.copy(u.uFogColor.value);
    if (fu.uBgLight) fu.uBgLight.value = _voxBg ? 1 : 0;   // 悬浮块:与地形同步的亮背景保护
    fu.uCoolCore.value.copy(u.uCoolCore.value); fu.uCoolEdge.value.copy(u.uCoolEdge.value);
    fu.uWarmCore.value.copy(u.uWarmCore.value); fu.uWarmEdge.value.copy(u.uWarmEdge.value);
    fu.uRippleColor.value.copy(u.uRippleColor.value);
    if (fu.uRippleColorHot && u.uRippleColorHot) fu.uRippleColorHot.value.copy(u.uRippleColorHot.value);
    if (_voxFbMesh.visible) for (var _bi = 0; _bi < VOX_FB_COUNT; _bi++) {
      var _blk = _voxFbBlocks[_bi];
      var _bob = Math.sin(_voxClock * (0.55 + _blk.rotationSpeed) + _blk.phase) * 0.45;    // 原作 506
      _voxDummyPos.set(_blk.x, _blk.y + _bob + _fbPulse * VOX_FB_INTENSITY * 1.4, _blk.z); // 原作 507
      _voxFbEuler.set(
        _voxClock * _blk.rotationSpeed + _blk.phase,
        _voxClock * _blk.rotationSpeed * 0.7 + _blk.phase,
        _voxClock * _blk.rotationSpeed * 0.45
      );                                                                                   // 原作 508-512
      _voxFbQuat.setFromEuler(_voxFbEuler);
      var _scl = _blk.baseScale * _pulseScale;                                             // 原作 514
      _voxDummyScale.set(_scl, _scl, _scl);
      _voxDummyMat.compose(_voxDummyPos, _voxFbQuat, _voxDummyScale);
      _voxFbMesh.setMatrixAt(_bi, _voxDummyMat);
    }
    _voxFbMesh.instanceMatrix.needsUpdate = true;
  }

  // ── 流星 / 拖尾粒子 / 雾 / 相机(原作 MapScene.tsx)──
  var _voxShowMeteors = !(typeof fx !== 'undefined' && fx && fx.voxMeteors === false);
  if (_voxMeteorMesh) _voxMeteorMesh.visible = _voxShowMeteors;
  if (_voxParticleMesh) _voxParticleMesh.visible = _voxShowMeteors;
  if (!_voxFogSet) {                                        // 进预设:存旧雾,设原作 Fog(baseColor1,30,95)
    _voxPrevFog = scene.fog;
    var bc = u.uBaseColor1.value;
    scene.fog = new THREE.Fog(new THREE.Color(bc.r, bc.g, bc.b), 30, 95);
    if (!_voxPrevFar && camera) { _voxPrevFar = camera.far; }
    if (camera) { camera.far = 600; camera.updateProjectionMatrix(); }   // 体素:far=600,自由镜头飞出去也不被裁
    _voxPrevBg = scene.background;                          // 存旧背景
    var _b2 = u.uBaseColor2.value;
    // app 级「背景媒体」(mp4视频/图片,DOM 层)也算自定义背景:scene.background 必须留 null 让 canvas 透明,
    // 否则进体素预设时大气色把视频盖死(用户实测:开机视频显示几秒→预设恢复→被顶下去)
    if (fx.voxBgColor || fx.voxBgImage) { _voxApplyBg(); }  // 体素专属自定义背景优先,体素让位
    else if (fx.backgroundMedia) { scene.background = null; }      // 视频背景让位:canvas 透明透出 DOM 视频层
    else if (fx.backgroundImage) { scene.background = null; _voxApplyGlobalImageBg(); }   // 全局图片背景:镜像进场景, 柱缝露图不漏光(加载完成前保持透明)
    else scene.background = new THREE.Color(bc.r * 0.6 + _b2.r * 0.4, bc.g * 0.6 + _b2.g * 0.4, bc.b * 0.6 + _b2.b * 0.4);
    _voxFogSet = true;
  } else if (scene.fog && scene.fog.color) {
    scene.fog.color.lerp(u.uBaseColor1.value, 3.0 * fdt);   // 原作 fog.color lerp uBaseColor1
    if (fx.backgroundMedia && scene.background) { scene.background = null; }   // 运行中途设了视频背景:立即让位
    else if (!fx.voxBgColor && !fx.voxBgImage && fx.backgroundImage) { _voxApplyGlobalImageBg(); _voxSyncGlobalBgAspect(); }   // 全局图片:确保已镜像 + 跟随窗口宽高比(中途设图也生效)
    else if (!fx.voxBgColor && !fx.voxBgImage && !fx.backgroundImage && _voxIsGlobalMirrorTex(scene.background)) {
      var _bbr1 = u.uBaseColor1.value, _bbr2 = u.uBaseColor2.value;   // 中途删了全局图片:镜像退场, 恢复大气色
      _voxGlobalBgKey = '';
      scene.background = new THREE.Color(_bbr1.r * 0.6 + _bbr2.r * 0.4, _bbr1.g * 0.6 + _bbr2.g * 0.4, _bbr1.b * 0.6 + _bbr2.b * 0.4);
    }
    if (!fx.voxBgColor && !fx.voxBgImage && scene.background && scene.background.isColor) {      // 无自定义背景时:大气色跟随 base1/base2
      var _bb1 = u.uBaseColor1.value, _bb2 = u.uBaseColor2.value;
      scene.background.setRGB(_bb1.r * 0.6 + _bb2.r * 0.4, _bb1.g * 0.6 + _bb2.g * 0.4, _bb1.b * 0.6 + _bb2.b * 0.4);
    }
  }
  _voxUpdateMeteors(fdt, u.uWarmCore.value);
  _voxUpdateParticles(fdt);
  _voxUpdateCamera(fdt);
}

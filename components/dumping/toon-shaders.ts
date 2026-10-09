// /dumping 모형 보기 건물·땅 받이 셰이더 조각(24라운드, toon-layer.ts 에서 분리). MeshLambertMaterial·ShadowMaterial 의 onBeforeCompile 에 끼운다.
import { CLOUD_SHADE_GLSL } from "./toon-assets"

// 건물 재질에 넣는 셰이더 조각(한국어 주석은 템플릿 밖에: 카피 게이트가 문자열 안 한글을 화면 문구로 읽는다).
// 꼭짓점: 동 번호로 색 텍스처(데이터 벽·지붕, 재질 벽·지붕)와 정보 텍스처(지면 y·벽 꼭대기 y·층수)를 읽어 넘긴다.
// 조각: 면 종류(aB.y)마다 색. 벽은 층·창 무늬(용도별), 난간 띠는 바깥이 밝은 갓돌·안쪽 그늘, 박공은 기와 줄, 물탱크는 탱크색.
// 데이터 텍셀 알파: 1 데이터 색(재질 밝기만 조금 남김) · 0.5 흐린 재질 · 0 재질 그대로. 눈(uRoofSnow)은 지붕면에만(바탕 없음일 때만, setWeather).
// 동 번호·텍셀 값은 flat varying(보간하지 않는다): 동 번호를 창 해시에 쓰니 1ulp 흔들려도 창이 얼룩질 수 있다
// 눈 위치 uEye 는 eyeOf 가 투영 행렬에서 푼다(이 층은 지도 행렬을 투영에 통째로 넣어 three 시점 행렬이 단위다)
// 25라운드 진입 비행 물결(uWave = 가운데 x·z, 반지름, 켬): 데이터 색이 그 원 안에서만 보인다(골목에서 바깥으로 번진다).
// 25라운드 측벽(면 종류 6): 창 없이 꼭대기 층 색띠(10층 이상 절반 남짓, TN_CROWN)와 그 아래 동 번호(정보 텍스처 w, 숫자 아틀라스 uDigits).
// 번호는 바깥에서 볼 때 왼쪽에서 오른쪽으로 읽히게 변 따라 거리를 뒤집는다(변 a→c 는 바깥에서 보면 오른쪽에서 왼쪽). 글자가 화면에서 작아지면 흐려지고 밤엔 은은히 켜진다.
// 숫자 조회는 픽셀마다 갈리는 분기 안이라 밉맵 단계가 정의되지 않는다 → 미분은 분기 밖 맨 앞(tnDdx·tnDdy)에서 구해 textureGrad 로 넘긴다
export const VERT_PARS = /* glsl */ `
attribute vec2 aB;
attribute vec2 aW;
uniform highp sampler2D uColors;
uniform highp sampler2D uInfo;
uniform float uColorsW;
uniform float uInfoW;
varying vec3 vLocal;
flat varying vec2 vPart;
varying vec2 vW;
flat varying vec4 vDataW;
flat varying vec4 vDataR;
flat varying vec4 vMatW;
flat varying vec4 vMatR;
flat varying vec4 vInfo;
vec4 tnTex(int t, int w) { return texelFetch(uColors, ivec2(t % w, t / w), 0); }`
export const VERT_MAIN = /* glsl */ `
vLocal = position;
vPart = vec2(aB.y, aB.x);
vW = aW;
int tnId = int(aB.x + 0.5);
int tnCW = int(uColorsW);
vDataW = tnTex(tnId * 4, tnCW);
vDataR = tnTex(tnId * 4 + 1, tnCW);
vMatW = tnTex(tnId * 4 + 2, tnCW);
vMatR = tnTex(tnId * 4 + 3, tnCW);
int tnIW = int(uInfoW);
vInfo = texelFetch(uInfo, ivec2(tnId % tnIW, tnId / tnIW), 0);`
export const FRAG_PARS = /* glsl */ `
uniform vec3 uGlass;
uniform vec3 uSkyRef;
uniform vec3 uCap;
uniform vec3 uRail;
uniform vec3 uTank;
uniform vec3 uMuted;
uniform vec3 uEye;
uniform float uNight;
uniform float uLit;
uniform vec3 uGlowWarm;
uniform vec3 uGlowCool;
uniform float uRoofSnow;
uniform vec3 uSnowC;
uniform float uCloudDark;
uniform sampler2D uDigits;
uniform vec4 uWave;
uniform vec3 uNumC;
uniform vec3 uNumGlow;
varying vec3 vLocal;
flat varying vec2 vPart;
varying vec2 vW;
flat varying vec4 vDataW;
flat varying vec4 vDataR;
flat varying vec4 vMatW;
flat varying vec4 vMatR;
flat varying vec4 vInfo;
${CLOUD_SHADE_GLSL}
float tnHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float tnBox(float x, vec2 r, float w) {
  return smoothstep(r.x - w, r.x + w, x) * (1.0 - smoothstep(r.y - w, r.y + w, x));
}
const vec3 TN_SIGNS[6] = vec3[6](vec3(0.58, 0.07, 0.05), vec3(0.03, 0.14, 0.42), vec3(0.72, 0.38, 0.03), vec3(0.03, 0.26, 0.09), vec3(0.8, 0.8, 0.78), vec3(0.04, 0.04, 0.05));
const vec3 TN_CROWN[5] = vec3[5](vec3(0.11, 0.2, 0.35), vec3(0.38, 0.14, 0.13), vec3(0.15, 0.3, 0.2), vec3(0.55, 0.4, 0.17), vec3(0.3, 0.31, 0.33));`
export const FRAG_COLOR = /* glsl */ `
vec2 tnDdx = vec2(dFdx(vW.x), dFdx(vLocal.y));
vec2 tnDdy = vec2(dFdy(vW.x), dFdy(vLocal.y));
float tnPart = floor(vPart.x + 0.5);
float tnId = vPart.y;
float tnStyle = floor(vMatW.a * 255.0 + 0.5);
float tnUse = mod(tnStyle, 16.0);
float tnDec = mod(floor(tnStyle / 16.0), 8.0);
float tnFloors = max(1.0, vInfo.z);
float tnGround = vInfo.x;
float tnTop = vInfo.y;
float tnIsData = step(0.75, vDataW.a);
float tnMuted = step(0.25, vDataW.a) * (1.0 - tnIsData);
if (uWave.w > 0.5) {
  float tnWv = smoothstep(uWave.z, uWave.z - 180.0, distance(vLocal.xz, uWave.xy));
  tnIsData *= tnWv;
  tnMuted *= tnWv;
}
vec3 tnLumW = vec3(dot(vMatW.rgb, vec3(0.2126, 0.7152, 0.0722)));
vec3 tnLumR = vec3(dot(vMatR.rgb, vec3(0.2126, 0.7152, 0.0722)));
vec3 tnWall = mix(vMatW.rgb, mix(tnLumW, uMuted, 0.4), tnMuted * 0.62);
vec3 tnRoof = mix(vMatR.rgb, mix(tnLumR, uMuted, 0.4), tnMuted * 0.62);
float tnK = clamp(0.9 + 0.5 * (tnLumW.r - 0.35), 0.78, 1.04);
tnWall = mix(tnWall, vDataW.rgb * tnK, tnIsData);
tnRoof = mix(tnRoof, vDataR.rgb, tnIsData);
vec3 tnC = tnWall;
float tnLit = 0.0;
vec3 tnGlow = uGlowWarm;
float tnY = vLocal.y - tnGround;
if (tnPart == 1.0) {
  tnC = mix(tnRoof, uSnowC, uRoofSnow);
} else if (tnPart == 2.0) {
  vec3 tnCapC = mix(uCap, mix(tnRoof, vec3(1.0), 0.3), tnIsData);
  tnC = mix(tnRoof * 0.68, tnCapC, smoothstep(0.3, 0.62, vW.x));
  tnC = mix(tnC, uSnowC, uRoofSnow * 0.8);
} else if (tnPart == 4.0) {
  float tnRow = fract(vLocal.y / 0.3);
  tnC = tnRoof * (0.84 + 0.16 * smoothstep(0.0, 0.35, tnRow));
  tnC = mix(tnC, uSnowC, uRoofSnow * 0.85);
} else if (tnPart == 5.0) {
  tnC = mix(uTank, tnWall, tnIsData * 0.6);
} else if (tnPart == 3.0) {
  tnC = mix(tnWall, vec3(0.6), 0.25 * (1.0 - tnIsData));
} else {
  float tnH = max(tnTop - tnGround, 2.0);
  float tnFh = tnH / tnFloors;
  float tnFv = tnY / tnFh;
  float tnFi = floor(tnFv);
  float tnFy = fract(tnFv);
  float tnLen = vW.y;
  float tnEnd = step(5.5, tnPart);
  float tnDS = abs(tnDdx.x) + abs(tnDdy.x);
  float tnSpan = 3.0;
  vec2 tnWu = vec2(0.27, 0.73);
  vec2 tnWv = vec2(0.32, 0.76);
  float tnSkip = 0.0;
  float tnBand = 0.0;
  float tnShop = 0.0;
  float tnPil = 0.0;
  float tnCurtain = 0.0;
  if (tnUse < 0.5) { tnSpan = 4.2; tnWu = vec2(0.33, 0.67); tnWv = vec2(0.36, 0.72); tnSkip = 0.5; }
  else if (tnUse < 1.5) { tnSpan = 3.6; tnWu = vec2(0.3, 0.7); tnWv = vec2(0.34, 0.74); tnSkip = 0.3; }
  else if (tnUse < 2.5) { tnSpan = 2.9; tnSkip = 0.08; tnPil = step(3.5, tnDec) * step(tnDec, 6.5) * step(4.0, tnFloors); }
  else if (tnUse < 3.5) {
    if (tnLen >= 12.0) { tnSpan = 3.3; tnWu = vec2(0.06, 0.94); tnWv = vec2(0.24, 0.86); tnBand = 1.0; }
    else { tnSpan = 4.6; tnWu = vec2(0.38, 0.62); tnWv = vec2(0.36, 0.72); }
  }
  else if (tnUse < 4.5) { tnSpan = 3.4; tnWu = vec2(0.2, 0.8); tnWv = vec2(0.3, 0.78); tnShop = 1.0; }
  else if (tnUse < 5.5) {
    if ((tnDec > 3.5 && tnDec < 6.5) || tnFloors >= 15.0) { tnCurtain = 1.0; tnSpan = 1.6; }
    else { tnSpan = 2.6; tnWu = vec2(0.15, 0.85); tnWv = vec2(0.25, 0.8); }
    tnGlow = uGlowCool;
  }
  else if (tnUse < 6.5) { tnSpan = 3.6; tnWu = vec2(0.08, 0.92); tnWv = vec2(0.3, 0.82); }
  else if (tnUse < 7.5) {
    if (tnFloors >= 10.0) { tnCurtain = 1.0; tnSpan = 2.1; }
    else { tnSpan = 2.6; tnWu = vec2(0.2, 0.8); tnWv = vec2(0.18, 0.86); }
    tnGlow = uGlowCool;
  }
  else { tnSpan = 6.0; tnWu = vec2(0.1, 0.9); tnWv = vec2(0.7, 0.88); tnSkip = 0.2; }
  float tnN = (tnEnd > 0.5 || tnLen < tnSpan * 0.55) ? 0.0 : max(1.0, floor(tnLen / tnSpan + 0.5));
  float tnU = vW.x / (tnLen / max(tnN, 1.0));
  float tnFu = fract(tnU);
  float tnCi = floor(tnU);
  float tnDu = fwidth(tnU);
  float tnDv = fwidth(tnFv);
  float tnFade = 1.0 - smoothstep(0.2, 0.5, max(tnDu, tnDv));
  float tnBody = step(0.5, tnN) * step(0.0, tnFi) * step(tnFi, tnFloors - 1.0) * step(0.5, tnY) * step(tnY, tnH - 0.3);
  float tnM;
  float tnCover;
  if (tnCurtain > 0.5) {
    tnM = tnBox(tnFu, vec2(0.06, 0.94), tnDu) * tnBox(tnFy, vec2(0.12, 0.97), tnDv);
    tnCover = 0.88 * 0.85;
  } else {
    tnM = tnBox(tnFu, tnWu, tnDu) * tnBox(tnFy, tnWv, tnDv);
    tnCover = (tnWu.y - tnWu.x) * (tnWv.y - tnWv.x);
    if (tnSkip > 0.0) { tnM *= step(tnSkip, tnHash(vec3(tnId, tnFi, tnCi))); tnCover *= 1.0 - tnSkip; }
  }
  if (tnShop > 0.5 && tnFi < 0.5) {
    tnM = tnBox(tnFu, vec2(0.05, 0.95), tnDu) * tnBox(tnFy, vec2(0.04, 0.7), tnDv);
    tnCover = 0.9 * 0.66;
    float tnSign = tnBox(tnFy, vec2(0.76, 0.96), tnDv) * step(0.5, tnN);
    vec3 tnSignC = TN_SIGNS[int(mod(floor(tnHash(vec3(tnId, 3.0, tnCi)) * 6.0), 6.0))];
    tnC = mix(tnC, mix(tnSignC, tnC * 0.9, tnIsData), tnSign * tnFade);
  }
  if (tnPil > 0.5 && tnFi < 0.5) {
    float tnCol = 1.0 - tnBox(tnFu, vec2(0.14, 0.86), tnDu);
    tnC *= mix(0.5, mix(0.3, 1.0, tnCol), tnFade);
    tnM = 0.0;
    tnCover = 0.0;
  }
  if (tnBand > 0.5) {
    float tnRail = tnBox(tnFy, vec2(-0.05, 0.16), tnDv);
    tnC = mix(tnC, mix(uRail, tnC, tnIsData * 0.5), tnRail * 0.75 * tnFade + 0.1 * (1.0 - tnFade));
  } else {
    tnC *= 1.0 - 0.1 * tnBox(tnFy, vec2(-0.03, 0.035), tnDv) * tnFade * step(0.5, tnFi);
  }
  if (tnUse > 7.5) tnC *= 0.95 + 0.05 * step(0.5, fract(vW.x / 0.6));
  float tnNum = 0.0;
  if (tnEnd > 0.5) {
    float tnCrown = step(tnFloors - 1.0, tnFi) * step(9.5, tnFloors) * step(tnHash(vec3(tnId, 11.0, 5.0)), 0.55);
    tnC = mix(tnC, TN_CROWN[int(mod(floor(tnHash(vec3(tnId, 13.0, 7.0)) * 5.0), 5.0))], tnCrown * 0.72 * (1.0 - 0.6 * tnIsData));
    float tnLab = vInfo.w;
    if (tnLab > 0.5) {
      float tnNd = tnLab > 999.5 ? 4.0 : tnLab > 99.5 ? 3.0 : tnLab > 9.5 ? 2.0 : 1.0;
      float tnGh = min(clamp(tnFh * 1.6, 3.0, 6.0), tnLen * 0.75 / (tnNd * 0.62 + (tnNd - 1.0) * 0.1));
      float tnGw = tnGh * 0.62;
      float tnGap = tnGh * 0.1;
      float tnTw = tnNd * tnGw + (tnNd - 1.0) * tnGap;
      float tnS = tnLen - vW.x - (tnLen - tnTw) * 0.5;
      float tnTy = tnY - (tnH - tnFh - 0.4 - tnGh);
      float tnK = floor(tnS / (tnGw + tnGap));
      float tnGx = (tnS - tnK * (tnGw + tnGap)) / tnGw;
      if (tnS >= 0.0 && tnS <= tnTw && tnTy >= 0.0 && tnTy <= tnGh && tnGx <= 1.0) {
        float tnP = tnNd - 1.0 - tnK;
        float tnPw = tnP > 2.5 ? 1000.0 : tnP > 1.5 ? 100.0 : tnP > 0.5 ? 10.0 : 1.0;
        float tnD = mod(floor((tnLab + 0.5) / tnPw), 10.0);
        vec2 tnGs = vec2(-1.0 / (10.0 * tnGw), 1.0 / tnGh);
        tnNum = textureGrad(uDigits, vec2((tnD + clamp(tnGx, 0.0, 1.0)) / 10.0, tnTy / tnGh), tnDdx * tnGs, tnDdy * tnGs).a;
        tnNum *= 1.0 - smoothstep(0.3, 0.7, tnDS / tnGw);
      }
      tnC = mix(tnC, uNumC, tnNum * 0.9 * (1.0 - 0.5 * tnIsData));
      totalEmissiveRadiance += uNumGlow * tnNum * uNight;
    }
  }
  float tnWin = mix(tnCover, tnM, tnFade) * tnBody;
  vec3 tnV = normalize(uEye - vLocal);
  float tnFres = pow(1.0 - clamp(abs(dot(normal, tnV)), 0.0, 1.0), 2.0);
  vec3 tnGlassC = mix(uGlass, uSkyRef, 0.15 + 0.55 * tnFres);
  tnGlassC = mix(tnGlassC, tnGlassC * 0.55 + tnWall * 0.45, tnCurtain * 0.5);
  tnGlassC = mix(tnGlassC, tnC * 0.5, tnIsData * 0.35);
  tnC = mix(tnC, tnGlassC, tnWin * 0.92);
  float tnR = tnHash(vec3(tnId + 7.0, tnFi, tnCi));
  float tnLitK = (tnShop > 0.5 && tnFi < 0.5) ? 0.9 : uLit;
  tnLit = mix(tnCover * tnLitK * 0.5, tnM * step(tnR, tnLitK), tnFade) * tnBody * uNight;
  tnC *= mix(0.7, 1.0, smoothstep(-0.3, 3.2, tnY));
}
diffuseColor.rgb = tnC;
totalEmissiveRadiance += tnGlow * tnLit;`
export const FRAG_LIGHT = /* glsl */ `
reflectedLight.directDiffuse *= 1.0 - uCloudDark * cloudShade(vLocal);`
// 그림자 받이(땅): 건물·나무 그림자에 구름 그늘을 더한다
export const RECV_VERT_PARS = /* glsl */ `
varying vec3 vCW;`
export const RECV_VERT = /* glsl */ `
vCW = (modelMatrix * vec4(transformed, 1.0)).xyz;`
export const RECV_FRAG_PARS = /* glsl */ `
uniform float uCloudRecv;
varying vec3 vCW;
${CLOUD_SHADE_GLSL}`
export const RECV_FRAG_FIND = "gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );"
export const RECV_FRAG = /* glsl */ `gl_FragColor = vec4( color, max( opacity * ( 1.0 - getShadowMask() ), uCloudRecv * cloudShade( vCW ) ) );`

#!/usr/bin/env node
// /dumping 격자 데이터(map.json) 암호화 — 공개 레포에는 암호문(.enc)만 두고, 빌드가 DUMPING_DATA_KEY로 푼다.
//
// 왜: 레포가 PUBLIC이라 data/dumping/map.json이 raw URL로 그대로 내려왔다(격자 집계·재배치 후보 대표주소 포함).
//     인증 라우트는 API만 막았지 저장소는 못 막는다. graph.json·interventions.json은 집계·설계 문서라 평문 유지.
// 사용:
//   node scripts/dumping-data.mjs encrypt   # map.json → map.json.enc (export 뒤 커밋 전에)
//   node scripts/dumping-data.mjs decrypt   # map.json.enc → map.json (build·dev 앞에서 자동)
//   node scripts/dumping-data.mjs keygen    # 새 키(hex 64자) 출력 — Vercel env와 .env.local에 같은 값
// 키가 없고 평문이 이미 있으면 decrypt는 그대로 통과한다(로컬 개발). 둘 다 없으면 실패한다.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const DIR = resolve(process.cwd(), "data/dumping")
const PLAIN = resolve(DIR, "map.json")
const ENC = resolve(DIR, "map.json.enc")
const MAGIC = "gjdump1" // 포맷 표식 — 바뀌면 복호화 거부

function loadKey() {
  let hex = process.env.DUMPING_DATA_KEY
  if (!hex && existsSync(resolve(process.cwd(), ".env.local"))) {
    const m = /^DUMPING_DATA_KEY=("?)([0-9a-fA-F]{64})\1\s*$/m.exec(readFileSync(resolve(process.cwd(), ".env.local"), "utf8"))
    if (m) hex = m[2]
  }
  if (!hex) return null
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("DUMPING_DATA_KEY는 hex 64자(32바이트)여야 합니다")
  return Buffer.from(hex, "hex")
}

function encrypt() {
  const key = loadKey()
  if (!key) throw new Error("DUMPING_DATA_KEY 없음 — keygen으로 만들고 .env.local·Vercel에 등록")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const plain = readFileSync(PLAIN)
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  // magic(7) | iv(12) | tag(16) | ciphertext
  writeFileSync(ENC, Buffer.concat([Buffer.from(MAGIC), iv, tag, body]))
  console.log(`encrypt: ${plain.length}B → ${ENC} (${body.length + 35}B)`)
}

function decrypt() {
  const key = loadKey()
  if (!existsSync(ENC)) {
    if (existsSync(PLAIN)) return console.log("decrypt: .enc 없음, 평문 사용")
    throw new Error("map.json.enc도 map.json도 없습니다")
  }
  if (!key) {
    if (existsSync(PLAIN)) return console.log("decrypt: 키 없음, 기존 평문 사용")
    throw new Error("DUMPING_DATA_KEY 없음 — 빌드 환경(Vercel env)에 키를 넣어야 map.json을 풀 수 있습니다")
  }
  const buf = readFileSync(ENC)
  if (buf.subarray(0, 7).toString() !== MAGIC) throw new Error("map.json.enc 포맷이 다릅니다")
  const iv = buf.subarray(7, 19)
  const tag = buf.subarray(19, 35)
  const body = buf.subarray(35)
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(body), decipher.final()])
  JSON.parse(plain.toString("utf8")) // 무결성 확인 — GCM 태그가 이미 보증하지만 JSON도 검사
  writeFileSync(PLAIN, plain)
  console.log(`decrypt: ${ENC} → ${PLAIN} (${plain.length}B)`)
}

const cmd = process.argv[2]
if (cmd === "encrypt") encrypt()
else if (cmd === "decrypt") decrypt()
else if (cmd === "keygen") console.log(randomBytes(32).toString("hex"))
else {
  console.error("usage: dumping-data.mjs encrypt|decrypt|keygen")
  process.exit(2)
}

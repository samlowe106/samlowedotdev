/* Wonder Mail S password codec for Pokémon Mystery Dungeon: Red/Blue Rescue Team.
 *
 * A Wonder Mail password is a 24-character string. Decoding it means: map each
 * character back to a 5-bit code (via CHARS), unshuffle the 24 codes according
 * to WONDERCODE, pack the 120 bits that result into 15 bytes, check the first
 * byte as a checksum of the other 14, then unpack those 14 bytes' 93 meaningful
 * bits into the named mission fields below (FIELDS).
 *
 * Encoding runs the whole thing in reverse. The bit-level plumbing
 *  (readBits/writeBits, the checksum, the character shuffle) is exactly
 * what the original DS games' own encoder does; this is a clean-room reimplementation
 * from publicly documented behavior, *not* decompiled game code
 */

import { WONDERCODE, CHARS } from './data/tables.js';

/** A decoded mission: 20 raw bytes at fixed offsets, see FIELDS below. */
/** @typedef {number[]} PassArray */

/** A bit-level read/write position into a byte array. */
/** @typedef {{ buf: number[], bytePos: number, bitPos: number }} Cursor */

const PASSWORD_LENGTH = 24;
const PACKED_BYTES = 15; /* 24 chars * 5 bits / 8 bits-per-byte */
const PAYLOAD_BYTES = PACKED_BYTES - 1; /* minus the checksum byte */

/* Each mission field's byte offset into the pass array and its bit width.
   Order matters: it's the exact order fields are laid into the bitstream. */
const FIELDS = [
  { offset: 0, bits: 4 }, /* format marker, always 5 */
  { offset: 1, bits: 3 }, /* mission type */
  { offset: 2, bits: 4 }, /* flavor text message type */
  { offset: 12, bits: 9 }, /* client Pokémon id */
  { offset: 14, bits: 9 }, /* target Pokémon id */
  { offset: 16, bits: 8 }, /* find/deliver item id */
  { offset: 17, bits: 4 }, /* reward kind */
  { offset: 18, bits: 8 }, /* reward item id */
  { offset: 19, bits: 6 }, /* Friend Area id */
  { offset: 8, bits: 24 }, /* flavor text variant seed ("mid") */
  { offset: 4, bits: 7 }, /* dungeon id */
  { offset: 5, bits: 7 } /* floor number */
];

const PASS_ARRAY_LENGTH = 20;

/* Bit-level copy between a byte array (LSB-first within each byte) and a
   cursor over another byte array. `cursor` tracks {buf, bytePos, bitPos}. */
/**
 * @param {Cursor} cursor
 * @param {number[]} dest
 * @param {number} destByteStart
 * @param {number} bitCount
 * @returns {void}
 */
function readBitsFromCursor(cursor, dest, destByteStart, bitCount) {
  let byteIndex = destByteStart;
  let bit = 0;
  for (let i = 0; i < bitCount; i++) {
    if (bit === 0) dest[byteIndex] = 0;
    const sourceByte = cursor.buf[cursor.bytePos] || 0;
    const sourceBit = (sourceByte >> cursor.bitPos) & 1;
    if (sourceBit) dest[byteIndex] |= 1 << bit;
    bit++;
    if (bit === 8) {
      byteIndex++;
      bit = 0;
    }
    cursor.bitPos++;
    if (cursor.bitPos === 8) {
      cursor.bytePos++;
      cursor.bitPos = 0;
    }
  }
}

/**
 * @param {Cursor} cursor
 * @param {number[]} source
 * @param {number} sourceByteStart
 * @param {number} bitCount
 * @returns {void}
 */
function writeBitsToCursor(cursor, source, sourceByteStart, bitCount) {
  let byteIndex = sourceByteStart;
  let bit = 0;
  for (let i = 0; i < bitCount; i++) {
    const sourceByte = source[byteIndex] || 0;
    const sourceBit = (sourceByte >> bit) & 1;
    if (sourceBit) cursor.buf[cursor.bytePos] |= 1 << cursor.bitPos;
    bit++;
    if (bit === 8) {
      byteIndex++;
      bit = 0;
    }
    cursor.bitPos++;
    if (cursor.bitPos === 8) {
      cursor.bytePos++;
      cursor.bitPos = 0;
    }
  }
}

/** @param {PassArray} passArray @returns {number[]} */
function packFields(passArray) {
  const cursor = { buf: new Array(PAYLOAD_BYTES).fill(0), bytePos: 0, bitPos: 0 };
  for (const field of FIELDS) {
    writeBitsToCursor(cursor, passArray, field.offset, field.bits);
  }
  return cursor.buf;
}

/** @param {number[]} payloadBytes @returns {PassArray} */
function unpackFields(payloadBytes) {
  const cursor = { buf: payloadBytes, bytePos: 0, bitPos: 0 };
  const passArray = new Array(PASS_ARRAY_LENGTH).fill(0);
  for (const field of FIELDS) {
    readBitsFromCursor(cursor, passArray, field.offset, field.bits);
  }
  return passArray;
}

/** @param {number[]} payloadBytes @returns {number} */
function checksumOf(payloadBytes) {
  let sum = 0;
  for (let i = 0; i < payloadBytes.length; i++) {
    sum = (sum + payloadBytes[i] + (i + 1)) & 0xff;
  }
  return sum;
}

/* Packs 14 payload bytes (+ a leading checksum byte) into 24 five-bit codes,
   then applies the WONDERCODE shuffle to get the final character order. */
/** @param {number[]} checksumedBytes @returns {number[]} */
function bytesToShuffledCodes(checksumedBytes) {
  const cursor = { buf: checksumedBytes, bytePos: 0, bitPos: 0 };
  const codes = new Array(PASSWORD_LENGTH).fill(0);
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    readBitsFromCursor(cursor, codes, i, 5);
  }
  const shuffled = new Array(PASSWORD_LENGTH);
  for (let position = 0; position < PASSWORD_LENGTH; position++) {
    /* WONDERCODE[j] == position for exactly one j; that j is where this
       position's code came from before shuffling. */
    const sourceIndex = WONDERCODE.indexOf(position);
    shuffled[position] = codes[sourceIndex];
  }
  return shuffled;
}

/* Inverse of bytesToShuffledCodes: undoes the WONDERCODE shuffle, then
   unpacks the 24 five-bit codes back into a checksum byte + 14 payload bytes. */
/** @param {number[]} codes @returns {number[]} */
function shuffledCodesToBytes(codes) {
  const unshuffled = new Array(PASSWORD_LENGTH);
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    unshuffled[i] = codes[WONDERCODE[i]];
  }
  const cursor = { buf: new Array(PACKED_BYTES).fill(0), bytePos: 0, bitPos: 0 };
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    writeBitsToCursor(cursor, unshuffled, i, 5);
  }
  return cursor.buf;
}

/* Encodes a mission "pass array" (see FIELDS) into a 24-character password. */
/** @param {PassArray} passArray @returns {string} */
export function encodePassword(passArray) {
  const payload = packFields(passArray);
  const checksum = checksumOf(payload);
  const checksumedBytes = [checksum, ...payload];
  const codes = bytesToShuffledCodes(checksumedBytes);
  return codes.map((code) => CHARS[code]).join('');
}

/* Decodes a 24-character password back into a pass array, or returns null if
   the password is malformed (bad characters, wrong length, bad checksum). */
/** @param {string} rawPassword @returns {PassArray | null} */
export function decodePassword(rawPassword) {
  const password = normalizePasswordInput(rawPassword);
  if (password.length !== PASSWORD_LENGTH) return null;
  const codes = new Array(PASSWORD_LENGTH);
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    const code = CHARS.indexOf(password[i] ?? '');
    if (code < 0) return null;
    codes[i] = code;
  }
  const bytes = shuffledCodesToBytes(codes);
  const checksum = bytes[0];
  const payload = bytes.slice(1);
  if (checksumOf(payload) !== checksum) return null;
  return unpackFields(payload);
}

/* Wonder Mail passwords are conventionally typed with '#'/'%'/'.' standing in
   for the ♂/♀/… symbols (the in-game keyboard has dedicated keys for them,
   but a US keyboard doesn't), plus a handful of bracketed spellings. This
   accepts any of those spellings and any of CODESWITCH's cosmetic dressing
   (spaces, dashes) and returns the canonical 24-character form. */
/** @param {string} input @returns {string} */
export function normalizePasswordInput(input) {
  return String(input)
    .normalize('NFKC')
    .replace(/[\n\s\r'"]/g, '')
    .replace(/[♂]/g, '#')
    .replace(/[♀]/g, '%')
    .replace(/[{([]m(ale?)?[)\]}]/gi, '#')
    .replace(/[{([]f(em(ale)?)?[)\]}]/gi, '%')
    .replace(/[{([]\.\.?\.?[)\]}]/g, '.')
    .replace(/[{([][…][)\]}]/g, '.')
    .replace(/[…]/g, '.')
    .toUpperCase();
}

/* Formats a canonical 24-character password for display: grouped 4-4-4/4-4-4,
   with the ASCII '#'/'%'/'.' stand-ins swapped for the real ♂/♀/… glyphs the
   password actually renders as on the DS's own font (and can be typed
   directly with the ♂/♀/… keys on the in-game keyboard). */
/** @param {string} password @returns {[string, string]} */
export function formatPasswordForDisplay(password) {
  const pretty = password.replace(/#/g, '♂').replace(/%/g, '♀').replace(/\./g, '…');
  const groups = pretty.match(/.{1,4}/g) || [];
  return [groups.slice(0, 3).join(' '), groups.slice(3, 6).join(' ')];
}

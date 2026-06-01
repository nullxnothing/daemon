'use strict';

Object.defineProperty(exports, '__esModule', { value: true });
exports.toBufferBE = exports.toBufferLE = exports.toBigIntBE = exports.toBigIntLE = void 0;

function toBytes(buf) {
  if (!Buffer.isBuffer(buf) && !(buf instanceof Uint8Array)) {
    throw new TypeError('buf must be a Buffer or Uint8Array');
  }
  return Buffer.from(buf);
}

function toWidth(width) {
  if (!Number.isSafeInteger(width) || width < 0) {
    throw new RangeError('width must be a non-negative safe integer');
  }
  return width;
}

function toNonNegativeBigInt(num) {
  if (typeof num !== 'bigint') {
    throw new TypeError('num must be a bigint');
  }
  if (num < 0n) {
    throw new RangeError('num must be non-negative');
  }
  return num;
}

function toBigIntLE(buf) {
  const bytes = toBytes(buf);
  bytes.reverse();
  const hex = bytes.toString('hex');
  return hex.length === 0 ? 0n : BigInt(`0x${hex}`);
}
exports.toBigIntLE = toBigIntLE;

function toBigIntBE(buf) {
  const bytes = toBytes(buf);
  const hex = bytes.toString('hex');
  return hex.length === 0 ? 0n : BigInt(`0x${hex}`);
}
exports.toBigIntBE = toBigIntBE;

function toBufferBE(num, width) {
  const size = toWidth(width);
  const value = toNonNegativeBigInt(num);
  const hex = value.toString(16).padStart(size * 2, '0');
  return Buffer.from(hex.slice(-size * 2), 'hex');
}
exports.toBufferBE = toBufferBE;

function toBufferLE(num, width) {
  const buffer = toBufferBE(num, width);
  buffer.reverse();
  return buffer;
}
exports.toBufferLE = toBufferLE;

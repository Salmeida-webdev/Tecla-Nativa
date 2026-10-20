import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const braces = require('braces')
const forge = require('node-forge')
const bracesPackage = JSON.parse(readFileSync(resolve(root, 'vendor/braces/package.json'), 'utf8'))
const forgePackage = JSON.parse(readFileSync(resolve(root, 'vendor/node-forge/package.json'), 'utf8'))

assert.equal(bracesPackage.version, '3.0.4-local.0')
assert.equal(forgePackage.version, '1.4.1-local.0')
assert.equal(require('braces/package.json').version, bracesPackage.version)
assert.equal(require('node-forge/package.json').version, forgePackage.version)
assert.throws(() => braces('{'.repeat(101) + 'x' + '}'.repeat(101)), /max depth/)
assert.doesNotThrow(() => braces('{'.repeat(100) + 'x' + '}'.repeat(100)))

const rsa = forge.pki.rsa.generateKeyPair({ bits: 512, e: 65537 })
const md = forge.md.sha1.create()
md.update('security-patch-smoke-test', 'utf8')
const signature = rsa.privateKey.sign(md)
assert.equal(rsa.publicKey.verify(md.digest().bytes(), signature), true)

console.log('Overrides resolvidos; limite do braces e assinatura RSA válida verificados.')

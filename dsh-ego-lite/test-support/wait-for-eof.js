#!/usr/bin/env node
let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  input += chunk
})
process.stdin.resume()
process.stdin.on('end', () => {
  process.stdout.write(input)
})

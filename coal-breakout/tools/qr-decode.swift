// Independent end-to-end PNG decoder, using Apple's Vision framework (optional local check, not CI).
// swift tools/qr-decode.swift tools/shots/phone390-poster.png
import Foundation
import Vision
import ImageIO
let path = CommandLine.arguments[1]
let request = VNDetectBarcodesRequest()
request.symbologies = [.qr]
let handler = VNImageRequestHandler(url: URL(fileURLWithPath: path), options: [:])
try handler.perform([request])
let payloads = (request.results ?? []).compactMap { $0.payloadStringValue }
let expected = "https://aliceljy.github.io/playground/coal-breakout/"
print(payloads.joined(separator: "\n"))
if !payloads.contains(expected) { exit(1) }

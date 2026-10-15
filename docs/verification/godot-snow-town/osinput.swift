// Posts ordinary macOS keyboard and mouse events (CGEvent at the HID tap) from a script on stdin.
// Usage: osinput ORIGIN_X ORIGIN_Y < script
// Script lines: down KEY | up KEY | tap KEY | move X Y (window-content points) | wheel N | sleep S | log TEXT
import Cocoa

let keys: [String: CGKeyCode] = [
    "w": 13, "a": 0, "s": 1, "d": 2, "shift": 56, "tab": 48, "minus": 27, "equal": 24, "0": 29,
    "[": 33, "]": 30, "f1": 122, "f4": 118, "f5": 96, "f6": 97, "f7": 98, "f8": 100, "f9": 101,
]
let source = CGEventSource(stateID: .hidSystemState)
let origin = CGPoint(x: Double(CommandLine.arguments[1])!, y: Double(CommandLine.arguments[2])!)
var shiftHeld = false
var cursor = origin
let started = Date()

func post(_ name: String, _ down: Bool) {
    guard let code = keys[name], let event = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: down) else {
        fatalError("unknown key \(name)")
    }
    if name == "shift" {
        shiftHeld = down
        event.type = .flagsChanged
    }
    event.flags = shiftHeld ? .maskShift : []
    event.post(tap: .cghidEventTap)
}

print("trusted for input: \(AXIsProcessTrusted())")
while let line = readLine() {
    let parts = line.split(separator: " ", maxSplits: 1).map(String.init)
    guard let command = parts.first, !command.hasPrefix("#") else { continue }
    let argument = parts.count > 1 ? parts[1] : ""
    switch command {
    case "down": post(argument, true)
    case "up": post(argument, false)
    case "tap": post(argument, true); usleep(60_000); post(argument, false)
    case "move":
        let xy = argument.split(separator: " ").map { Double($0)! }
        cursor = CGPoint(x: origin.x + xy[0], y: origin.y + xy[1])
        CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: cursor, mouseButton: .left)?
            .post(tap: .cghidEventTap)
    case "wheel":
        let count = Int(argument)!
        for _ in 0..<abs(count) {
            CGEvent(scrollWheelEvent2Source: source, units: .line, wheelCount: 1, wheel1: count > 0 ? 1 : -1, wheel2: 0, wheel3: 0)?
                .post(tap: .cghidEventTap)
            usleep(120_000)
        }
    case "sleep": usleep(useconds_t(Double(argument)! * 1_000_000))
    case "log": print(String(format: "%7.2f s  %@", Date().timeIntervalSince(started), argument))
    default: fatalError("unknown command \(command)")
    }
    fflush(stdout)
}
for name in ["w", "a", "s", "d", "shift"] { post(name, false) }

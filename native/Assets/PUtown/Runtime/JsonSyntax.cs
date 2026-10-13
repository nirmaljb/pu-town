using System;

namespace PUtown.Runtime
{
    /// <summary>Reject extensions accepted by Json.NET: comments, single quotes, bare keys and trailing commas.</summary>
    internal sealed class JsonSyntax
    {
        private readonly string text;
        private int index;
        private JsonSyntax(string text) { this.text = text; }
        public static void Require(string text, int maximumLength = 4194304)
        {
            if (text == null || text.Length > maximumLength) throw new FormatException("Invalid JSON payload size.");
            var parser = new JsonSyntax(text); parser.Value(0); parser.Space(); if (parser.index != text.Length) parser.Fail();
        }
        private void Space() { while (index < text.Length && (text[index] == ' ' || text[index] == '\n' || text[index] == '\r' || text[index] == '\t')) ++index; }
        private char Current { get { return index < text.Length ? text[index] : '\0'; } }
        private void Value(int depth)
        {
            if (depth > 64) Fail(); Space();
            if (Current == '{')
            {
                ++index; Space(); if (Current == '}') { ++index; return; }
                while (true) { Space(); String(); Space(); Take(':'); Value(depth + 1); Space(); if (Current == '}') { ++index; return; } Take(','); }
            }
            if (Current == '[')
            {
                ++index; Space(); if (Current == ']') { ++index; return; }
                while (true) { Value(depth + 1); Space(); if (Current == ']') { ++index; return; } Take(','); }
            }
            if (Current == '"') { String(); return; }
            if (Current == 't') { Literal("true"); return; }
            if (Current == 'f') { Literal("false"); return; }
            if (Current == 'n') { Literal("null"); return; }
            Number();
        }
        private void String()
        {
            Take('"');
            while (index < text.Length)
            {
                var c = text[index++]; if (c == '"') return; if (c < 32) Fail();
                if (c != '\\') continue;
                if (index >= text.Length) Fail(); c = text[index++];
                if (c == 'u') { for (var i = 0; i < 4; ++i) { if (index >= text.Length || !Uri.IsHexDigit(text[index++])) Fail(); } }
                else if (c != '"' && c != '\\' && c != '/' && c != 'b' && c != 'f' && c != 'n' && c != 'r' && c != 't') Fail();
            }
            Fail();
        }
        private void Number()
        {
            if (Current == '-') ++index;
            if (Current == '0') ++index;
            else { if (Current < '1' || Current > '9') Fail(); Digits(); }
            if (Current == '.') { ++index; RequiredDigits(); }
            if (Current == 'e' || Current == 'E') { ++index; if (Current == '+' || Current == '-') ++index; RequiredDigits(); }
        }
        private void Digits() { while (Current >= '0' && Current <= '9') ++index; }
        private void RequiredDigits() { if (Current < '0' || Current > '9') Fail(); Digits(); }
        private void Literal(string literal) { foreach (var c in literal) Take(c); }
        private void Take(char c) { if (Current != c) Fail(); ++index; }
        private void Fail() { throw new FormatException("Server message must be valid strict JSON."); }
    }
}

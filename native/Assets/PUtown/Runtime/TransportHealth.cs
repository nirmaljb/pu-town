using System;

namespace PUtown.Runtime
{
    public enum HealthAction { None, Ping, Failure }
    /// <summary>Driven by a transport timer, never a Unity frame or the Game clock.</summary>
    public sealed class TransportHealth
    {
        private double lastResponse, nextPing, lastCheck;
        private bool allowanceUsed, failed;
        public void ConfirmMembership(double now) { lastResponse = lastCheck = now; nextPing = now + 5000; allowanceUsed = failed = false; }
        public void Pong(double now) { lastResponse = now; allowanceUsed = false; }
        public HealthAction Check(double now, bool resume = false)
        {
            if (failed) return HealthAction.None;
            var delayed = now - lastCheck > 2000; lastCheck = now;
            if ((resume || delayed) && !allowanceUsed) { allowanceUsed = true; lastResponse = now; nextPing = now; }
            if (now - lastResponse >= 10000) { failed = true; return HealthAction.Failure; }
            if (now >= nextPing) { nextPing = now + 5000; return HealthAction.Ping; }
            return HealthAction.None;
        }
    }
}

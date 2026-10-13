using System.Collections.Concurrent;
using System.Threading;

namespace PUtown.Runtime
{
    public sealed class InboundEvent
    {
        public readonly int Generation;
        public readonly double ArrivedAt;
        public readonly ProtocolEvent Message;
        public readonly string Failure;
        public readonly int CloseCode;
        public InboundEvent(int generation, double arrivedAt, ProtocolEvent message = null, string failure = null, int closeCode = 0)
        { Generation = generation; ArrivedAt = arrivedAt; Message = message; Failure = failure; CloseCode = closeCode; }
    }
    /// <summary>Never replaces or evicts events. Overflow retires the connection so recovery can restore a snapshot.</summary>
    public sealed class ArrivalInbox
    {
        private readonly ConcurrentQueue<InboundEvent> events = new ConcurrentQueue<InboundEvent>();
        private readonly int capacity;
        private int count;
        public ArrivalInbox(int capacity = 4096) { this.capacity = capacity; }
        public bool Enqueue(InboundEvent item)
        {
            if (Interlocked.Increment(ref count) > capacity) { Interlocked.Decrement(ref count); return false; }
            events.Enqueue(item); return true;
        }
        public bool Take(out InboundEvent item) { if (!events.TryDequeue(out item)) return false; Interlocked.Decrement(ref count); return true; }
        public void Clear() { while (Take(out _)) { } }
    }
}

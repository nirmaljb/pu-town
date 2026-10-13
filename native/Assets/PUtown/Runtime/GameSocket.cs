using System;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace PUtown.Runtime
{
    public interface IGameSocket : IDisposable
    {
        event Action<string> Received;
        event Action<int, string> Closed;
        Task Connect(Uri endpoint);
        Task Send(string payload);
        void Abort();
    }
    public sealed class GameSocket : IGameSocket
    {
        private readonly ClientWebSocket socket = new ClientWebSocket();
        private readonly CancellationTokenSource cancellation = new CancellationTokenSource();
        private readonly SemaphoreSlim sendGate = new SemaphoreSlim(1, 1);
        private int notified;
        public event Action<string> Received;
        public event Action<int, string> Closed;
        public GameSocket()
        {
            // Explicit native protocol handshake; developer access still needs peer/authority checks on Java.
            socket.Options.SetRequestHeader("X-PUtown-Native-Version", "1");
            socket.Options.KeepAliveInterval = TimeSpan.Zero;
        }
        public async Task Connect(Uri endpoint)
        {
            await socket.ConnectAsync(endpoint, cancellation.Token).ConfigureAwait(false);
            _ = Receive();
        }
        private async Task Receive()
        {
            var buffer = new byte[8192];
            try
            {
                while (!cancellation.IsCancellationRequested)
                {
                    using (var message = new MemoryStream())
                    {
                        WebSocketReceiveResult result;
                        do
                        {
                            result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellation.Token).ConfigureAwait(false);
                            if (result.MessageType == WebSocketMessageType.Close) { Notify((int)(result.CloseStatus ?? WebSocketCloseStatus.Empty), result.CloseStatusDescription); return; }
                            if (result.MessageType != WebSocketMessageType.Text || message.Length + result.Count > 4194304) throw new FormatException("Unsupported WebSocket payload.");
                            message.Write(buffer, 0, result.Count);
                        } while (!result.EndOfMessage);
                        var utf8 = new UTF8Encoding(false, true);
                        Received?.Invoke(utf8.GetString(message.ToArray()));
                    }
                }
            }
            catch (Exception e) when (e is WebSocketException || e is OperationCanceledException || e is FormatException || e is DecoderFallbackException || e is ObjectDisposedException)
            { Notify(1006, "Game connection ended."); }
        }
        public async Task Send(string payload)
        {
            await sendGate.WaitAsync(cancellation.Token).ConfigureAwait(false);
            try { var bytes = Encoding.UTF8.GetBytes(payload); await socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, cancellation.Token).ConfigureAwait(false); }
            finally { sendGate.Release(); }
        }
        private void Notify(int code, string reason) { if (Interlocked.Exchange(ref notified, 1) == 0) Closed?.Invoke(code, reason); }
        public void Abort() { cancellation.Cancel(); socket.Abort(); Notify(1006, "Game connection ended."); }
        public void Dispose() { Abort(); socket.Dispose(); }
    }
}

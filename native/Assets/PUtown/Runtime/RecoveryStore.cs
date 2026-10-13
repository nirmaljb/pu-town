using System;
using System.IO;
using System.Runtime.InteropServices;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace PUtown.Runtime
{
    public sealed class RecoveryIntent
    {
        public readonly string Endpoint, RoomId, Token, DisplayName;
        public RecoveryIntent(string endpoint, string roomId, string token, string displayName) { Endpoint = endpoint; RoomId = roomId; Token = token; DisplayName = displayName; }
        public JObject Request { get { return StrictProtocol.Command("recover_room", "roomId", RoomId, "recoveryToken", Token); } }
    }
    public interface IRecoveryStore { RecoveryIntent Read(string endpoint); void Save(RecoveryIntent intent); void Clear(); }

    /// <summary>Application-local membership intent. Never logs the credential or introduces an account identity.</summary>
    public sealed class FileRecoveryStore : IRecoveryStore
    {
        private readonly string path;
        #if UNITY_STANDALONE_OSX || UNITY_EDITOR_OSX || UNITY_STANDALONE_LINUX || UNITY_EDITOR_LINUX
        [DllImport("libc", SetLastError = true)] private static extern int chmod(string pathname, int mode);
        #endif
        public FileRecoveryStore(string path) { this.path = path; }
        public RecoveryIntent Read(string endpoint)
        {
            try
            {
                if (!File.Exists(path)) return null;
                var d = StrictProtocol.ParseObject(File.ReadAllText(path)); StrictProtocol.Fields(d, "version", "endpoint", "roomId", "recoveryToken", "displayName");
                if (StrictProtocol.Integer(d["version"]) != 1) throw new FormatException();
                if (d["displayName"].Type != JTokenType.String) throw new FormatException();
                var savedEndpoint = StrictProtocol.Text(d["endpoint"]); if (savedEndpoint != endpoint) return null;
                return new RecoveryIntent(savedEndpoint, StrictProtocol.Text(d["roomId"]), StrictProtocol.RecoveryToken(d["recoveryToken"]), (string)d["displayName"] ?? "");
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException || e is FormatException || e is JsonException) { Clear(); return null; }
        }
        public void Save(RecoveryIntent intent)
        {
            var json = new JObject { ["version"] = 1, ["endpoint"] = intent.Endpoint, ["roomId"] = intent.RoomId, ["recoveryToken"] = intent.Token, ["displayName"] = intent.DisplayName };
            try
            {
                var directory = Path.GetDirectoryName(path); Directory.CreateDirectory(directory);
                #if UNITY_STANDALONE_OSX || UNITY_EDITOR_OSX || UNITY_STANDALONE_LINUX || UNITY_EDITOR_LINUX
                if (chmod(directory, 448) != 0) throw new IOException("Membership directory permissions could not be restricted.");
                #endif
                var temporary = path + ".tmp";
                using (var output = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    #if UNITY_STANDALONE_OSX || UNITY_EDITOR_OSX || UNITY_STANDALONE_LINUX || UNITY_EDITOR_LINUX
                    if (chmod(temporary, 384) != 0) throw new IOException("Membership credential permissions could not be restricted.");
                    #endif
                    using (var writer = new StreamWriter(output)) writer.Write(json.ToString(Formatting.None));
                }
                if (File.Exists(path)) File.Replace(temporary, path, null); else File.Move(temporary, path);
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException) { /* In-memory recovery remains available. */ }
        }
        public void Clear() { try { if (File.Exists(path)) File.Delete(path); if (File.Exists(path + ".tmp")) File.Delete(path + ".tmp"); } catch (Exception e) when (e is IOException || e is UnauthorizedAccessException) { } }
    }
}

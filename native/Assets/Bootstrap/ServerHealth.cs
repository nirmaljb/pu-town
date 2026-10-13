using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

namespace PUtown.Bootstrap
{
    // This status component is independent of Room Membership and Game transport.
    public sealed class ServerHealth : MonoBehaviour
    {
        public string Status { get; private set; } = "Checking server…";
        public string Endpoint { get; private set; }

        private IEnumerator Start()
        {
            Endpoint = "http://localhost:8080/health";
            var args = Environment.GetCommandLineArgs();
            for (var i = 0; i + 1 < args.Length; i++)
                if (args[i] == "-server" && Uri.TryCreate(args[i + 1], UriKind.Absolute, out var server) &&
                    (server.Scheme == "ws" || server.Scheme == "wss"))
                    Endpoint = new UriBuilder(server) { Scheme = server.Scheme == "wss" ? "https" : "http", Path = "/health", Query = "" }.Uri.AbsoluteUri;
            for (var i = 0; i + 1 < args.Length; i++)
                if (args[i] == "--health") Endpoint = args[i + 1];
            while (enabled)
            {
                yield return Check();
                yield return new WaitForSecondsRealtime(10);
            }
        }

        private IEnumerator Check()
        {
            if (!Uri.TryCreate(Endpoint, UriKind.Absolute, out var uri) ||
                (uri.Scheme != "http" && uri.Scheme != "https"))
            {
                Status = "Invalid health endpoint";
                yield break;
            }
            using (var request = UnityWebRequest.Get(uri))
            {
                request.timeout = 5;
                yield return request.SendWebRequest();
                Status = request.result == UnityWebRequest.Result.Success &&
                         request.downloadHandler.text.Trim() == "{\"status\":\"healthy\"}"
                    ? "Server healthy" : "Server unavailable";
                Debug.Log("PU Town health: " + Status);
            }
        }

        private void OnGUI()
        {
            GUI.color = Status == "Server healthy" ? new Color(.65f, .95f, .75f) : Color.white;
            GUI.Label(new Rect(16, Screen.height - 30, Screen.width - 32, 24), Status);
        }
    }
}

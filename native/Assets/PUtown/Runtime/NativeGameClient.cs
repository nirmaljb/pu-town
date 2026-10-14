using System;
using System.Collections;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;
using Unity.Profiling;

namespace PUtown.Runtime
{
    [DefaultExecutionOrder(-1000)]
    public sealed class NativeGameClient : MonoBehaviour
    {
        private static readonly ProfilerMarker ApplyFrameMarker = new ProfilerMarker("PUtown.ApplyFrame");
        private static readonly ProfilerMarker MovementMarker = new ProfilerMarker("PUtown.Movement");
        private static readonly ProfilerMarker AvatarsMarker = new ProfilerMarker("PUtown.Avatars");
        private static readonly ProfilerMarker InterfaceMarker = new ProfilerMarker("PUtown.Interface");
        private static readonly ProfilerMarker OcclusionMarker = new ProfilerMarker("PUtown.Occlusion");
        public string ServerEndpoint = "ws://localhost:8080/ws/game";
        public GameSession Session { get; private set; }
        public TownRules Town { get; private set; }
        public Vector3 OwnAvatarPosition { get; private set; }
        public INativeVoiceControls VoiceControls { get; set; }
        public bool Typing { get { return overlay?.Typing ?? false; } }
        private readonly NativeAvatarCollection collection = new NativeAvatarCollection();
        private readonly LocalPrediction local = new LocalPrediction();
        private TownScene townScene;
        private AvatarActors actors;
        private NativeOverlay overlay;
        private NativeAudio audio;
        private Camera followCamera;
        private Light sunlight;
        private Vector3 cameraVelocity;
        private float zoom = 8.5f;
        private Font font;
        private string assetsError, loadedRoom;
        private long snapshotSerial = -1;
        private bool loading;

        private void Start()
        {
            Application.runInBackground = true; Application.targetFrameRate = 60;
            NativePreferences.Restore();
            font = Resources.Load<Font>("Fonts/AtkinsonHyperlegible-Regular");
            ApplyTown(NativeTownMaps.Default);
            audio = new NativeAudio(Town);
            var args = Environment.GetCommandLineArgs(); var endpoint = Argument(args, "-server") ?? ServerEndpoint;
            var profile = Argument(args, "-profile") ?? "default";
            if (!Regex.IsMatch(profile, "^[a-zA-Z0-9_-]{1,48}$")) throw new FormatException("The profile must use letters, numbers, underscore or hyphen.");
            Session = new GameSession(endpoint, () => new GameSocket(), new FileRecoveryStore(Path.Combine(Application.persistentDataPath, "memberships", profile + ".json")));
            var developerRoom = Argument(args, "-dev-room"); var developerPlayer = Argument(args, "-dev-player");
            if (developerRoom != null && developerPlayer != null && Session.Status == SessionStatus.Entry) Session.TakeDeveloperPlayer(developerRoom, developerPlayer);
            overlay = new NativeOverlay(Session, Town, collection, font, () => { if (!loading && Session.World.RoomId != null) StartCoroutine(LoadRoomCollection()); }, () => VoiceControls);
            followCamera = Camera.main;
            if (followCamera == null) { var cameraObject = new GameObject("Town follow camera"); cameraObject.tag = "MainCamera"; followCamera = cameraObject.AddComponent<Camera>(); cameraObject.AddComponent<AudioListener>(); }
            followCamera.nearClipPlane = .1f; followCamera.farClipPlane = 110; followCamera.fieldOfView = 45;
            followCamera.transform.rotation = Quaternion.Euler(48, 35, 0);
            sunlight = FindObjectsByType<Light>().FirstOrDefault(light => light.type == LightType.Directional);
            if (sunlight == null) { sunlight = new GameObject("Town daylight").AddComponent<Light>(); sunlight.type = LightType.Directional; sunlight.transform.rotation = Quaternion.Euler(50, -25, 0); }
            sunlight.shadows = LightShadows.Soft; sunlight.shadowStrength = .7f;
            OwnAvatarPosition = Town.ToWorld((float)Town.Data["meeting"]["x"], (float)Town.Data["meeting"]["y"]);
            followCamera.transform.position = OwnAvatarPosition + Vector3.up * .85f - followCamera.transform.forward * zoom;
            StartCoroutine(CheckDeveloperCapability());
        }
        private static string Argument(string[] arguments, string key) { var index = Array.IndexOf(arguments, key); return index >= 0 && index + 1 < arguments.Length ? arguments[index + 1] : null; }
        private void Update()
        {
            if (Session == null) return;
            // Every queued network/lifecycle event applies before world objects, presentation or this frame's input.
            using (ApplyFrameMarker.Auto()) Session.ApplyFrame();
            var world = Session.World; var now = GameSession.MonotonicMilliseconds();
            if (world.RoomId != null && NativeTownMaps.Supports(world.MapId) && Town.MapId != world.MapId && assetsError == null)
            {
                Session.AssetsReady = false;
                try
                {
                    ApplyTown(world.MapId);
                    if (loadedRoom == world.RoomId && collection.Covers(world) && !loading) Session.AssetsReady = true;
                }
                catch (Exception e) when (e is FormatException || e is InvalidOperationException) { assetsError = e.Message; }
            }
            if (snapshotSerial != world.SnapshotSerial && world.RoomId != null)
            {
                snapshotSerial = world.SnapshotSerial;
                if (loadedRoom == world.RoomId && collection.Covers(world) && Town.MapId == world.MapId && assetsError == null) Session.AssetsReady = true;
                else if (!loading && !Session.SelectingTown) StartCoroutine(LoadRoomCollection());
            }
            if (world.RoomId == null)
            {
                Session.AssetsReady = false;
                if (!loading && loadedRoom != null) { loadedRoom = null; actors.Dispose(); collection.Dispose(); local.Reset(); }
            }
            else if (Session.Status == SessionStatus.Active && !Session.SelectingTown && !Session.AssetsReady && !loading && assetsError == null) StartCoroutine(LoadRoomCollection());
            if (Session.AssetsReady && !collection.Covers(world)) { Session.AssetsReady = false; assetsError = "The Room referenced an Avatar outside its pinned collection."; }
            var input = Vector2.zero;
            if (Session.CanControl && !overlay.Typing)
            {
                var x = (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow) ? 1 : 0) - (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow) ? 1 : 0);
                var y = (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow) ? 1 : 0) - (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow) ? 1 : 0);
                var forward = Vector3.ProjectOnPlane(followCamera.transform.forward, Vector3.up).normalized; var right = Vector3.ProjectOnPlane(followCamera.transform.right, Vector3.up).normalized;
                var cameraRelative = forward * y + right * x; input = new Vector2(cameraRelative.x, cameraRelative.z / Town.ZSign);
            }
            using (MovementMarker.Auto()) local.Update(world, Town, input, Time.unscaledDeltaTime, now, Session.CanControl && !overlay.Typing, (x, y, facing) => Session.Control("move", "x", x, "y", y, "facing", facing));
            if (local.Active) OwnAvatarPosition = Town.ToWorld(local.Position.x, local.Position.y);
            else if (world.Players.TryGetValue(world.SelfPlayerId ?? "", out var own)) OwnAvatarPosition = Town.ToWorld((float)own["x"], (float)own["y"]);
            using (AvatarsMarker.Auto())
            { if (Session.AssetsReady) actors.Render(world, collection, local, followCamera, Time.unscaledDeltaTime); else actors.Dispose(); }
            using (InterfaceMarker.Auto()) overlay.Render(now, assetsError);
            audio.Update(world, Session.CanControl, VoiceControls?.Enabled ?? false);
            if (VoiceControls != null)
            {
                VoiceControls.SetVolumes(NativePreferences.Volume("master"), NativePreferences.Volume("voice"));
                VoiceControls.SetInputAllowed(!overlay.Typing && Application.isFocused);
                VoiceControls.SetListenerPose(OwnAvatarPosition, Town.Facing(local.Active ? local.Facing : "down"));
            }
            if (!overlay.Typing && !overlay.PointerOverInterface) zoom = Mathf.Clamp(zoom - Input.mouseScrollDelta.y * .6f, 5.5f, 12);
            var meeting = world.Phase != "day" && world.Phase != "night";
            var distance = meeting ? Mathf.Max(zoom, 10.5f) : zoom;
            var cameraTarget = OwnAvatarPosition + Vector3.up * .85f - followCamera.transform.forward * distance;
            followCamera.transform.position = NativePreferences.ReducedMotion ? cameraTarget : Vector3.SmoothDamp(followCamera.transform.position, cameraTarget, ref cameraVelocity, .15f, float.PositiveInfinity, Time.unscaledDeltaTime);
            using (OcclusionMarker.Auto()) townScene.ApplyOcclusion(followCamera, OwnAvatarPosition + Vector3.up * .8f, Time.unscaledDeltaTime, Session.AssetsReady);
            var night = world.Phase == "night"; sunlight.color = Color.Lerp(sunlight.color, night ? new Color(.38f, .54f, 1) : new Color(1, .96f, .87f), Time.unscaledDeltaTime * 2);
            sunlight.intensity = Mathf.Lerp(sunlight.intensity, night ? .3f : .95f, Time.unscaledDeltaTime * 2);
            RenderSettings.ambientLight = night ? new Color(.17f, .24f, .42f) : new Color(.48f, .55f, .52f); followCamera.backgroundColor = night ? new Color(.05f, .10f, .19f) : new Color(.69f, .79f, .77f);
        }
        private IEnumerator LoadRoomCollection()
        {
            loading = true; Session.AssetsReady = false; assetsError = null;
            var roomId = Session.World.RoomId;
            if (!NativeTownMaps.Supports(Session.World.MapId)) { assetsError = "This Room uses a browser Town Map. Create a native Room in Woodland Village or Market Town."; loading = false; yield break; }
            if (Town.MapId != Session.World.MapId)
            {
                try { ApplyTown(Session.World.MapId); }
                catch (Exception e) when (e is FormatException || e is InvalidOperationException) { assetsError = e.Message; }
                if (assetsError != null) { loading = false; yield break; }
            }
            yield return collection.Fetch(Session.Endpoint, roomId, error => assetsError = error);
            loading = false;
            if (Session.World.RoomId != roomId) { collection.Dispose(); loadedRoom = null; assetsError = null; yield break; }
            if (assetsError == null)
            {
                if (collection.Covers(Session.World)) { loadedRoom = roomId; Session.AssetsReady = Session.Status == SessionStatus.Active; }
                else assetsError = "The pinned Avatar Collection does not contain every Player's accepted appearance.";
            }
        }
        private void ApplyTown(string mapId)
        {
            var rules = NativeTownMaps.Load(mapId);
            var scene = new TownScene(rules, font);
            townScene?.Dispose(); actors?.Dispose();
            Town = rules; townScene = scene; actors = new AvatarActors(rules, font); local.Reset();
            audio?.SetRules(rules); overlay?.SetRules(rules);
            OwnAvatarPosition = rules.ToWorld((float)rules.Data["meeting"]["x"], (float)rules.Data["meeting"]["y"]);
            cameraVelocity = Vector3.zero;
            if (followCamera != null) followCamera.transform.position = OwnAvatarPosition + Vector3.up * .85f - followCamera.transform.forward * zoom;
        }
        private IEnumerator CheckDeveloperCapability()
        {
            var source = new Uri(Session.Endpoint); var uri = new UriBuilder(source) { Scheme = source.Scheme == "wss" ? "https" : "http", Path = "/developer/capabilities", Query = "" }.Uri;
            using (var request = UnityWebRequest.Get(uri))
            {
                request.SetRequestHeader("X-PUtown-Native-Version", "1"); request.timeout = 5; yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success) yield break;
                var d = StrictProtocol.ParseObject(request.downloadHandler.text); StrictProtocol.Fields(d, "enabled");
                if (StrictProtocol.Bool(d["enabled"])) overlay.EnableDeveloperEntry();
            }
        }
        private void OnApplicationFocus(bool focus) { if (focus) Session?.Resume(); }
        private void OnApplicationPause(bool paused) { if (!paused) Session?.Resume(); }
        private void OnDestroy() { Session?.Dispose(); overlay?.Dispose(); actors?.Dispose(); collection.Dispose(); townScene?.Dispose(); audio?.Dispose(); }
    }
}

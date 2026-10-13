using System;
using System.Collections;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace PUtown.Runtime
{
    [DefaultExecutionOrder(-1000)]
    public sealed class NativeGameClient : MonoBehaviour
    {
        public string ServerEndpoint = "ws://localhost:8080/ws/game";
        public GameSession Session { get; private set; }
        public CampusRules Campus { get; private set; }
        public Vector3 OwnAvatarPosition { get; private set; }
        public INativeVoiceControls VoiceControls { get; set; }
        public bool Typing { get { return overlay?.Typing ?? false; } }
        private readonly NativeAvatarCollection collection = new NativeAvatarCollection();
        private readonly LocalPrediction local = new LocalPrediction();
        private CampusScene campusScene;
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
            var rules = Resources.Load<TextAsset>("Campus/campus");
            if (rules == null) { Debug.LogError("The native build is missing its canonical campus publication."); enabled = false; return; }
            Campus = new CampusRules(rules.text); campusScene = new CampusScene(Campus, font); actors = new AvatarActors(Campus, font);
            audio = new NativeAudio(Campus);
            var args = Environment.GetCommandLineArgs(); var endpoint = Argument(args, "-server") ?? ServerEndpoint;
            var profile = Argument(args, "-profile") ?? "default";
            if (!Regex.IsMatch(profile, "^[a-zA-Z0-9_-]{1,48}$")) throw new FormatException("The profile must use letters, numbers, underscore or hyphen.");
            Session = new GameSession(endpoint, () => new GameSocket(), new FileRecoveryStore(Path.Combine(Application.persistentDataPath, "memberships", profile + ".json")));
            var developerRoom = Argument(args, "-dev-room"); var developerPlayer = Argument(args, "-dev-player");
            if (developerRoom != null && developerPlayer != null && Session.Status == SessionStatus.Entry) Session.TakeDeveloperPlayer(developerRoom, developerPlayer);
            overlay = new NativeOverlay(Session, Campus, collection, font, () => { if (!loading && Session.World.RoomId != null) StartCoroutine(LoadRoomCollection()); }, () => VoiceControls);
            followCamera = Camera.main;
            if (followCamera == null) { var cameraObject = new GameObject("Campus follow camera"); cameraObject.tag = "MainCamera"; followCamera = cameraObject.AddComponent<Camera>(); cameraObject.AddComponent<AudioListener>(); }
            followCamera.nearClipPlane = .1f; followCamera.farClipPlane = 110; followCamera.fieldOfView = 45;
            followCamera.transform.rotation = Quaternion.Euler(48, 35, 0);
            sunlight = FindObjectsByType<Light>().FirstOrDefault(light => light.type == LightType.Directional);
            if (sunlight == null) { sunlight = new GameObject("Campus daylight").AddComponent<Light>(); sunlight.type = LightType.Directional; sunlight.transform.rotation = Quaternion.Euler(50, -25, 0); }
            sunlight.shadows = LightShadows.Soft; sunlight.shadowStrength = .7f;
            OwnAvatarPosition = Campus.ToWorld((float)Campus.Data["meeting"]["x"], (float)Campus.Data["meeting"]["y"]);
            followCamera.transform.position = OwnAvatarPosition + Vector3.up * .85f - followCamera.transform.forward * zoom;
            StartCoroutine(CheckDeveloperCapability());
        }
        private static string Argument(string[] arguments, string key) { var index = Array.IndexOf(arguments, key); return index >= 0 && index + 1 < arguments.Length ? arguments[index + 1] : null; }
        private void Update()
        {
            if (Session == null) return;
            // Every queued network/lifecycle event applies before world objects, presentation or this frame's input.
            Session.ApplyFrame(); var world = Session.World; var now = GameSession.MonotonicMilliseconds();
            if (snapshotSerial != world.SnapshotSerial && world.RoomId != null)
            {
                snapshotSerial = world.SnapshotSerial;
                if (loadedRoom == world.RoomId && collection.Covers(world)) Session.AssetsReady = true;
                else if (!loading && !Session.SelectingCampus) StartCoroutine(LoadRoomCollection());
            }
            if (world.RoomId == null)
            {
                Session.AssetsReady = false;
                if (!loading && loadedRoom != null) { loadedRoom = null; actors.Dispose(); collection.Dispose(); }
            }
            else if (Session.Status == SessionStatus.Active && !Session.SelectingCampus && !Session.AssetsReady && !loading && assetsError == null) StartCoroutine(LoadRoomCollection());
            if (Session.AssetsReady && !collection.Covers(world)) { Session.AssetsReady = false; assetsError = "The Room referenced an Avatar outside its pinned collection."; }
            var input = Vector2.zero;
            if (Session.CanControl && !overlay.Typing)
            {
                var x = (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow) ? 1 : 0) - (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow) ? 1 : 0);
                var y = (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow) ? 1 : 0) - (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow) ? 1 : 0);
                var forward = Vector3.ProjectOnPlane(followCamera.transform.forward, Vector3.up).normalized; var right = Vector3.ProjectOnPlane(followCamera.transform.right, Vector3.up).normalized;
                var cameraRelative = forward * y + right * x; input = new Vector2(cameraRelative.x, cameraRelative.z / Campus.ZSign);
            }
            local.Update(world, Campus, input, Time.unscaledDeltaTime, now, Session.CanControl && !overlay.Typing, (x, y, facing) => Session.Control("move", "x", x, "y", y, "facing", facing));
            if (local.Active) OwnAvatarPosition = Campus.ToWorld(local.Position.x, local.Position.y);
            else if (world.Players.TryGetValue(world.SelfPlayerId ?? "", out var own)) OwnAvatarPosition = Campus.ToWorld((float)own["x"], (float)own["y"]);
            if (Session.AssetsReady) actors.Render(world, collection, local, followCamera, Time.unscaledDeltaTime); else actors.Dispose();
            var accepted = world.Field?["self"]; var area = accepted == null ? "outdoors" : Campus.Area((float)accepted["x"], (float)accepted["y"]); campusScene.ApplyArea(area);
            overlay.Render(now, assetsError);
            audio.Update(world, Session.CanControl, VoiceControls?.Enabled ?? false);
            if (VoiceControls != null)
            {
                VoiceControls.SetVolumes(NativePreferences.Volume("master"), NativePreferences.Volume("voice"));
                VoiceControls.SetInputAllowed(!overlay.Typing && Application.isFocused);
                VoiceControls.SetListenerPose(OwnAvatarPosition, Campus.Facing(local.Active ? local.Facing : "down"));
            }
            if (!overlay.Typing && !overlay.PointerOverInterface) zoom = Mathf.Clamp(zoom - Input.mouseScrollDelta.y * .6f, 5.5f, 12);
            var meeting = world.Phase != "day" && world.Phase != "night";
            var distance = meeting ? Mathf.Max(zoom, 10.5f) : zoom;
            var cameraTarget = OwnAvatarPosition + Vector3.up * .85f - followCamera.transform.forward * distance;
            followCamera.transform.position = NativePreferences.ReducedMotion ? cameraTarget : Vector3.SmoothDamp(followCamera.transform.position, cameraTarget, ref cameraVelocity, .15f, float.PositiveInfinity, Time.unscaledDeltaTime);
            var night = world.Phase == "night"; sunlight.color = Color.Lerp(sunlight.color, night ? new Color(.38f, .54f, 1) : new Color(1, .96f, .87f), Time.unscaledDeltaTime * 2);
            sunlight.intensity = Mathf.Lerp(sunlight.intensity, night ? .3f : .95f, Time.unscaledDeltaTime * 2);
            RenderSettings.ambientLight = night ? new Color(.17f, .24f, .42f) : new Color(.48f, .55f, .52f); followCamera.backgroundColor = night ? new Color(.05f, .10f, .19f) : new Color(.69f, .79f, .77f);
        }
        private IEnumerator LoadRoomCollection()
        {
            loading = true; Session.AssetsReady = false; assetsError = null;
            var roomId = Session.World.RoomId;
            if (Session.World.MapId != "campus") { assetsError = "This Room uses a retired browser Town Map. Create a native campus Room."; loading = false; yield break; }
            yield return collection.Fetch(Session.Endpoint, roomId, error => assetsError = error);
            loading = false;
            if (Session.World.RoomId != roomId) { collection.Dispose(); loadedRoom = null; assetsError = null; yield break; }
            if (assetsError == null)
            {
                if (collection.Covers(Session.World)) { loadedRoom = roomId; Session.AssetsReady = Session.Status == SessionStatus.Active; }
                else assetsError = "The pinned Avatar Collection does not contain every Player's accepted appearance.";
            }
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
        private void OnDestroy() { Session?.Dispose(); overlay?.Dispose(); actors?.Dispose(); collection.Dispose(); campusScene?.Dispose(); audio?.Dispose(); }
    }
}

using UnityEngine;

namespace PUtown.Runtime
{
    /// <summary>Native media implementation owns grants/sessions. Runtime owns local controls and Player presentation.</summary>
    public interface INativeVoiceControls
    {
        bool Enabled { get; }
        bool Muted { get; }
        bool PushToTalk { get; }
        string MicrophoneDevice { get; }
        string Status { get; }
        string[] MicrophoneDevices { get; }
        void SetEnabled(bool value);
        void SetMuted(bool value);
        void SetPushToTalk(bool value);
        void SetMicrophoneDevice(string value);
        void SetVolumes(float master, float voice);
        void SetInputAllowed(bool value);
        void SetListenerPose(Vector3 position, Quaternion rotation);
    }
}

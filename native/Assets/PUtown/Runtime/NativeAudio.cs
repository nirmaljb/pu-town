using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace PUtown.Runtime
{
    /// <summary>Original synthesized ambience/score. Avatar cues require a server sound_event authorization.</summary>
    public sealed class NativeAudio : IDisposable
    {
        private readonly GameObject root;
        private readonly AudioSource ambience, music, effects;
        private readonly List<AudioClip> clips = new List<AudioClip>();
        private TownRules town;
        private long snapshot = -1, lastSound;
        private string phase;
        private readonly Dictionary<string, AudioClip> steps = new Dictionary<string, AudioClip>();
        public NativeAudio(TownRules town)
        {
            this.town = town; root = new GameObject("Town audio"); ambience = Source("Wind and birds"); music = Source("Town score"); effects = Source("Authorized effects");
            ambience.clip = Ambience(); ambience.loop = true; ambience.Play(); music.clip = Score(); music.loop = true; music.Play();
            steps["outdoors"] = Footstep("Stone footstep", .065f, .5f); steps["indoors"] = Footstep("Indoor footstep", .055f, .32f);
            steps["enter"] = Tone("Door enter", 280, .12f); steps["exit"] = Tone("Door exit", 220, .12f); steps["phase"] = Tone("Phase transition", 330, .24f);
        }
        public void SetRules(TownRules rules) { town = rules; }
        private AudioSource Source(string name) { var obj = new GameObject(name); obj.transform.SetParent(root.transform); var source = obj.AddComponent<AudioSource>(); source.playOnAwake = false; source.spatialBlend = 0; return source; }
        private AudioClip Clip(string name, float[] samples) { var clip = AudioClip.Create(name, samples.Length, 1, 22050, false); clip.SetData(samples, 0); clips.Add(clip); return clip; }
        private AudioClip Ambience()
        {
            const int rate = 22050, seconds = 32; var samples = new float[rate * seconds]; var random = new System.Random(619); double wind = 0;
            for (var i = 0; i < samples.Length; ++i)
            {
                var time = i / (double)rate; wind = wind * .993 + (random.NextDouble() * 2 - 1) * .007;
                var value = wind * .12 * (1 + .3 * Math.Sin(time * .8));
                foreach (var start in new[] { 3.2, 11.4, 19.7, 26.1 })
                {
                    var chirp = time - start;
                    if (chirp >= 0 && chirp < .6) { var envelope = Math.Sin(chirp / .6 * Math.PI) * Math.Sin(chirp * Math.PI * 12); value += Math.Sin(2 * Math.PI * (2100 * chirp + 650 * chirp * chirp)) * envelope * .035; }
                }
                var fade = Math.Min(1, Math.Min(time, seconds - time)); samples[i] = (float)(value * fade);
            }
            return Clip("Original town wind and birds", samples);
        }
        private AudioClip Score()
        {
            const int rate = 22050, seconds = 32; var samples = new float[rate * seconds]; var notes = new[] { 196.0, 246.94, 293.66, 220.0, 196.0, 261.63, 246.94, 293.66 };
            for (var i = 0; i < samples.Length; ++i)
            {
                var time = i / (double)rate; var local = time % 4; var note = notes[(int)(time / 4) % notes.Length]; var envelope = Math.Sin(local / 4 * Math.PI) * Math.Exp(-local * .6);
                samples[i] = (float)((Math.Sin(2 * Math.PI * note * local) + .25 * Math.Sin(2 * Math.PI * note * 2 * local)) * envelope * .025);
            }
            return Clip("Original restrained town score", samples);
        }
        private AudioClip Footstep(string name, float duration, float sharpness)
        {
            var samples = new float[(int)(22050 * duration)]; var random = new System.Random(name.GetHashCode());
            for (var i = 0; i < samples.Length; ++i) { var t = i / 22050d; samples[i] = (float)((Math.Sin(2 * Math.PI * 90 * t) * .4 + (random.NextDouble() * 2 - 1) * sharpness) * Math.Exp(-t * 75) * .12); }
            return Clip(name, samples);
        }
        private AudioClip Tone(string name, float frequency, float duration)
        {
            var samples = new float[(int)(22050 * duration)]; for (var i = 0; i < samples.Length; ++i) { var t = i / 22050d; samples[i] = (float)(Math.Sin(2 * Math.PI * frequency * t) * Math.Sin(t / duration * Math.PI) * .045); } return Clip(name, samples);
        }
        public void Update(NativeWorld world, bool active, bool voiceEnabled)
        {
            var duck = voiceEnabled ? .4f : 1;
            var quiet = world.Phase == "night" || world.RoomId != null && !active;
            ambience.volume = quiet ? 0 : NativePreferences.Gain("ambience") * duck;
            music.volume = quiet ? 0 : NativePreferences.Gain("music") * duck;
            effects.volume = NativePreferences.Gain("effects") * duck;
            if (!active || snapshot != world.SnapshotSerial) { effects.Stop(); snapshot = world.SnapshotSerial; lastSound = world.Sounds.LastOrDefault()?["eventId"]?.Value<long>() ?? 0; phase = world.Phase; return; }
            if (world.Phase != phase) { effects.Stop(); if (phase != null && world.Phase != null && world.Phase != "night") effects.PlayOneShot(steps["phase"]); phase = world.Phase; }
            foreach (var sound in world.Sounds)
            {
                var eventId = (long)sound["eventId"]; if (eventId <= lastSound) continue; lastSound = eventId;
                if (world.Phase != "day" || world.Field == null || (int)sound["round"] != world.Round) continue;
                var id = (string)sound["playerId"]; var authorized = ((Newtonsoft.Json.Linq.JArray)world.Field["players"]).FirstOrDefault(p => (string)p["playerId"] == id);
                if (authorized == null || (bool)authorized["ghost"] && id != world.SelfPlayerId) continue;
                var kind = (string)sound["kind"]; var key = kind == "footstep" ? town.Area((float)authorized["x"], (float)authorized["y"]) == "outdoors" ? "outdoors" : "indoors" : kind;
                if (steps.TryGetValue(key, out var clip)) effects.PlayOneShot(clip, (float)sound["gain"]);
            }
        }
        public void Dispose() { UnityEngine.Object.Destroy(root); foreach (var clip in clips) UnityEngine.Object.Destroy(clip); }
    }
}

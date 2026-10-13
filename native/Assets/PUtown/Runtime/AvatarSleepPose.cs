using System.Linq;
using UnityEngine;

namespace PUtown.Runtime
{
    // The same cosmetic Night pose applies to every visible Role. It adds no
    // movement, root motion or Game choice and retains the published rig.
    public sealed class AvatarSleepPose : MonoBehaviour
    {
        public Animator Rig;
        public bool Sleeping;
        private Renderer[] eyes;
        private bool previous;

        private void LateUpdate()
        {
            if (Rig == null || Rig.avatar == null || !Rig.avatar.isHuman) return;
            if (eyes == null) eyes = GetComponentsInChildren<Renderer>(true).Where(r => r.name == "Eyes" || r.name.Contains("Eye white") || r.name.Contains("Eye pupil")).ToArray();
            if (Sleeping != previous)
            {
                foreach (var eye in eyes) eye.enabled = !Sleeping;
                previous = Sleeping;
            }
            if (!Sleeping) return;
            var neck = Rig.GetBoneTransform(HumanBodyBones.Neck);
            var head = Rig.GetBoneTransform(HumanBodyBones.Head);
            if (neck != null) neck.localRotation *= Quaternion.Euler(18, 0, 0);
            if (head != null) head.localRotation *= Quaternion.Euler(10, 0, 0);
        }
    }
}

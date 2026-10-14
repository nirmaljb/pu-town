Shader "PUtown/Town Occluder"
{
    Properties
    {
        _Color ("Tint", Color) = (1,1,1,1)
        _MainTex ("Albedo", 2D) = "white" {}
        _BumpMap ("Normal", 2D) = "bump" {}
        _BumpScale ("Normal strength", Float) = 1
        _MetallicGlossMap ("Metallic and smoothness", 2D) = "white" {}
        _Metallic ("Metallic", Range(0,1)) = 0
        _Glossiness ("Smoothness", Range(0,1)) = .15
        _OcclusionMap ("Occlusion", 2D) = "white" {}
        _OcclusionStrength ("Occlusion strength", Range(0,1)) = 1
        _Cutoff ("Cutout", Range(0,1)) = 0
        _Visibility ("Local camera visibility", Range(0,1)) = 1
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        LOD 200
        Cull Off
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows addshadow
        #pragma target 3.0
        #pragma multi_compile_instancing
        #include "UnityCG.cginc"
        #include "UnityStandardUtils.cginc"
        sampler2D _MainTex, _BumpMap, _MetallicGlossMap, _OcclusionMap;
        fixed4 _Color;
        half _BumpScale, _Metallic, _Glossiness, _OcclusionStrength, _Cutoff, _Visibility;
        struct Input { float2 uv_MainTex; float2 uv_BumpMap; float4 screenPos; };
        void surf(Input input, inout SurfaceOutputStandard output)
        {
            fixed4 albedo = tex2D(_MainTex, input.uv_MainTex) * _Color;
            clip(albedo.a - _Cutoff);
            float2 pixel = floor(input.screenPos.xy / input.screenPos.w * _ScreenParams.xy);
            float threshold = frac(52.9829189 * frac(dot(pixel, float2(.06711056, .00583715))));
            clip(_Visibility - threshold);
            fixed4 metallic = tex2D(_MetallicGlossMap, input.uv_MainTex);
            output.Albedo = albedo.rgb;
            output.Normal = UnpackScaleNormal(tex2D(_BumpMap, input.uv_BumpMap), _BumpScale);
            output.Metallic = metallic.r * _Metallic;
            output.Smoothness = metallic.a * _Glossiness;
            output.Occlusion = lerp(1, tex2D(_OcclusionMap, input.uv_MainTex).g, _OcclusionStrength);
            output.Alpha = 1;
        }
        ENDCG
    }
    Fallback "Diffuse"
}

Shader "PUtown/Quaternius Foliage"
{
    Properties
    {
        _Color ("Tint", Color) = (1,1,1,1)
        _MainTex ("Albedo and cutout", 2D) = "white" {}
        _Cutoff ("Alpha cutoff", Range(0,1)) = 0.2
        _BumpMap ("Normal", 2D) = "bump" {}
        _BumpScale ("Normal strength", Range(0,2)) = 1
        _Glossiness ("Smoothness", Range(0,1)) = 0.08
        _WindStrength ("Decorative wind in world metres", Range(0,.1)) = 0
        _GreenTint ("Garden leaf palette", Range(0,1)) = 0
        _LeafGreen ("Garden leaf green", Color) = (.42,.58,.30,1)
        _Visibility ("Camera visibility", Range(0,1)) = 1
    }
    SubShader
    {
        Tags { "Queue"="AlphaTest" "RenderType"="TransparentCutout" }
        LOD 200
        Cull Off
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows addshadow alphatest:_Cutoff vertex:vert
        #pragma target 3.0
        #pragma multi_compile_instancing
        #include "UnityCG.cginc"
        sampler2D _MainTex;
        sampler2D _BumpMap;
        fixed4 _Color;
        half _Glossiness;
        half _BumpScale;
        half _WindStrength;
        half _GreenTint;
        fixed4 _LeafGreen;
        half _Visibility;
        struct Input
        {
            float2 uv_MainTex;
            float2 uv_BumpMap;
            float facing : VFACE;
            float4 screenPos;
        };
        void vert(inout appdata_full vertex)
        {
            float3 world = mul(unity_ObjectToWorld, vertex.vertex).xyz;
            float tip = saturate(vertex.vertex.y);
            float sway = sin(_Time.y*1.1+world.x*.73+world.z*.51)*_WindStrength*tip;
            world.xz += float2(sway,sway*.47);
            vertex.vertex = mul(unity_WorldToObject,float4(world,1));
        }
        void surf(Input input, inout SurfaceOutputStandard output)
        {
            // A screen-space threshold preserves original cutout/normal maps while
            // the local camera reveals only an already-authorized Avatar.
            float2 pixel = floor(input.screenPos.xy / input.screenPos.w * _ScreenParams.xy);
            float threshold = frac(dot(pixel, float2(.754877666, .569840296)));
            clip(_Visibility - threshold - .00001);
            fixed4 colour = tex2D(_MainTex, input.uv_MainTex) * _Color;
            float luminance = dot(colour.rgb, float3(.299,.587,.114));
            output.Albedo = lerp(colour.rgb, _LeafGreen.rgb * lerp(.65,1.3,luminance), _GreenTint);
            output.Alpha = colour.a;
            output.Metallic = 0;
            output.Smoothness = _Glossiness;
            half3 normal = UnpackNormal(tex2D(_BumpMap, input.uv_BumpMap));
            normal.xy *= _BumpScale;
            normal.z = sqrt(saturate(1.0 - dot(normal.xy, normal.xy)));
            output.Normal = normal * (input.facing < 0 ? -1 : 1);
        }
        ENDCG
    }
    Fallback "Transparent/Cutout/VertexLit"
}

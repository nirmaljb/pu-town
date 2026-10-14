Shader "PUtown/Town Paving"
{
    Properties
    {
        _MainTex ("Retained stone", 2D) = "white" {}
        _BumpMap ("Retained stone normal", 2D) = "bump" {}
        _Color ("Stone tint", Color) = (.84,.86,.78,1)
        _Tiling ("Repeats per world metre", Float) = 1
        _Square ("Square centre and radii", Vector) = (0,0,0,0)
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows
        #pragma target 3.0
        #pragma multi_compile_instancing
        #include "TownSurfaceNoise.cginc"
        sampler2D _MainTex, _BumpMap;
        fixed4 _Color;
        float _Tiling;
        float4 _Square;
        struct Input { float3 worldPos; };
        void surf(Input input, inout SurfaceOutputStandard output)
        {
            float2 position = input.worldPos.xz;
            fixed3 stone = tex2D(_MainTex, position * _Tiling).rgb;
            float ring = 0;
            if (_Square.z > 0)
            {
                float distance = length((position - _Square.xy) / _Square.zw);
                ring = smoothstep(.90,.94,distance);
            }
            output.Albedo = stone * _Color.rgb * lerp(1,.66,ring) * lerp(.96,1.04,TownNoise(position * .3));
            output.Normal = UnpackNormal(tex2D(_BumpMap, position * _Tiling));
            output.Normal.xy *= .45;
            output.Normal = normalize(output.Normal);
            output.Metallic = 0;
            output.Smoothness = .06;
            output.Alpha = 1;
        }
        ENDCG
    }
    Fallback "Diffuse"
}

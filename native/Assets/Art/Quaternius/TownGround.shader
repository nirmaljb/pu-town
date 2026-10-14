Shader "PUtown/Town Ground"
{
    Properties
    {
        _Color ("Meadow", Color) = (.412,.549,.294,1)
        _ShadeColor ("Cool shade", Color) = (.310,.420,.247,1)
        _DryColor ("Earth", Color) = (.580,.565,.380,1)
        _SoilTex ("Supplied surface detail", 2D) = "gray" {}
        _Glossiness ("Smoothness", Range(0,1)) = .035
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        LOD 200
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows
        #pragma target 3.0
        #pragma multi_compile_instancing
        #include "TownSurfaceNoise.cginc"
        sampler2D _SoilTex;
        fixed4 _Color, _ShadeColor, _DryColor;
        half _Glossiness;
        struct Input { float3 worldPos; };
        void surf(Input input, inout SurfaceOutputStandard output)
        {
            float2 position = input.worldPos.xz;
            float detail = dot(tex2D(_SoilTex, position * .65).rgb, float3(.299,.587,.114));
            output.Albedo = TownGroundColour(position, _Color.rgb, _ShadeColor.rgb, _DryColor.rgb) * lerp(.94,1.04,detail);
            output.Metallic = 0;
            output.Smoothness = _Glossiness;
            output.Normal = normalize(float3((TownNoise(position * 4.1)-.5)*.045,
                (TownNoise(position * 4.1+12.3)-.5)*.045,1));
            output.Alpha = 1;
        }
        ENDCG
    }
    Fallback "Diffuse"
}

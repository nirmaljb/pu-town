Shader "PUtown/Campus Garden Ground"
{
    Properties
    {
        _Color ("Grass", Color) = (.412,.549,.294,1)
        _ShadeColor ("Cool grass shade", Color) = (.310,.420,.247,1)
        _DryColor ("Dry grass and earth", Color) = (.580,.565,.380,1)
        _SoilTex ("Supplied soil detail", 2D) = "gray" {}
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
        #include "CampusSurfaceNoise.cginc"
        sampler2D _SoilTex;
        fixed4 _Color;
        fixed4 _ShadeColor;
        fixed4 _DryColor;
        half _Glossiness;
        struct Input { float3 worldPos; };
        void surf(Input input, inout SurfaceOutputStandard output)
        {
            float2 position = input.worldPos.xz;
            float soil = dot(tex2D(_SoilTex, position * .65).rgb, float3(.299,.587,.114));
            output.Albedo = CampusGroundColour(position, _Color.rgb, _ShadeColor.rgb, _DryColor.rgb) * lerp(.94,1.04,soil);
            output.Metallic = 0;
            output.Smoothness = _Glossiness;
            output.Normal = normalize(float3((CampusNoise(position * 4.1)-.5)*.045,
                (CampusNoise(position * 4.1+12.3)-.5)*.045,1));
            output.Alpha = 1;
        }
        ENDCG
    }
    Fallback "Diffuse"
}

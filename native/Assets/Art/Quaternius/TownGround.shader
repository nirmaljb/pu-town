Shader "PUtown/Town Ground"
{
    Properties
    {
        _Color ("Meadow", Color) = (.412,.549,.294,1)
        _ShadeColor ("Cool shade", Color) = (.310,.420,.247,1)
        _DryColor ("Earth", Color) = (.580,.565,.380,1)
        _SoilTex ("Supplied surface detail", 2D) = "gray" {}
        _SurfaceMask ("Street and foundation shoulders", 2D) = "black" {}
        _TownSize ("World width and signed depth", Vector) = (1,1,0,0)
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
        sampler2D _SoilTex, _SurfaceMask;
        float4 _TownSize;
        fixed4 _Color, _ShadeColor, _DryColor;
        half _Glossiness;
        struct Input { float3 worldPos; };
        void surf(Input input, inout SurfaceOutputStandard output)
        {
            float2 position = input.worldPos.xz;
            float detail = dot(tex2D(_SoilTex, position * .65).rgb, float3(.299,.587,.114));
            float shoulder = tex2D(_SurfaceMask, position / _TownSize.xy).r;
            shoulder = saturate(shoulder + (TownNoise(position * 5.3) - .5) * .18 * shoulder);
            float grain = TownNoise(position * 42);
            float blade = TownNoise(position * float2(85,28));
            float3 grass = TownGroundColour(position, _Color.rgb, _ShadeColor.rgb, _DryColor.rgb) * lerp(.88,1.08,blade);
            float3 earth = _DryColor.rgb * lerp(.68,1.03,detail) * lerp(.86,1.08,grain);
            output.Albedo = lerp(grass, earth, shoulder);
            output.Metallic = 0;
            output.Smoothness = _Glossiness;
            output.Normal = normalize(float3((blade-.5)*.12, (grain-.5)*.10,1));
            output.Alpha = 1;
        }
        ENDCG
    }
    Fallback "Diffuse"
}

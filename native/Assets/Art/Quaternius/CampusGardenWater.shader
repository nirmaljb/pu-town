Shader "PUtown/Campus Garden Water"
{
    Properties
    {
        _Color ("Water turquoise", Color) = (.337,.749,.714,1)
        _DeepColor ("Deeper teal", Color) = (.210,.485,.478,1)
        _SandColor ("Shallow shore", Color) = (.690,.670,.455,1)
        _GroundColor ("Neighbouring grass", Color) = (.412,.549,.294,1)
        _GroundShade ("Neighbouring grass shade", Color) = (.310,.420,.247,1)
        _GroundDry ("Neighbouring dry earth", Color) = (.580,.565,.380,1)
        _SoilTex ("Supplied shore soil detail", 2D) = "gray" {}
        _Bounds ("Exact canonical world rectangle", Vector) = (0,0,1,1)
        _ShoreWidth ("Shore fading inside rectangle", Range(.1,2)) = .65
        _Glossiness ("Smoothness", Range(0,1)) = .48
        _SpecularHighlights ("Specular highlights", Float) = 1
        _GlossyReflections ("Glossy reflections", Float) = 1
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        LOD 200
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows
        #pragma target 3.0
        #pragma multi_compile_instancing
        #pragma shader_feature_local _SPECULARHIGHLIGHTS_OFF
        #pragma shader_feature_local _GLOSSYREFLECTIONS_OFF
        #include "CampusSurfaceNoise.cginc"
        fixed4 _Color;
        fixed4 _DeepColor;
        fixed4 _SandColor;
        fixed4 _GroundColor;
        fixed4 _GroundShade;
        fixed4 _GroundDry;
        sampler2D _SoilTex;
        float4 _Bounds;
        half _ShoreWidth;
        half _Glossiness;
        struct Input { float3 worldPos; };
        void surf(Input input, inout SurfaceOutputStandard output)
        {
            float2 position = input.worldPos.xz;
            float edge = min(min(position.x-_Bounds.x,_Bounds.z-position.x),min(position.y-_Bounds.y,_Bounds.w-position.y));
            float variation = CampusNoise(position * 2.2 + 13.1);
            float shore = smoothstep(0,_ShoreWidth,edge + (variation-.5)*.26*saturate(edge/.26));
            float depth = saturate(edge / 1.45);
            float flow = _Time.y * .12;
            float wave = sin(position.x*5.7 + position.y*2.9 + flow*3.1) * sin(position.y*6.4-position.x*1.6-flow*2.3);
            float3 water = lerp(_Color.rgb,_DeepColor.rgb,depth*.72 + CampusMottle(position*.42)*.16);
            water *= 1 + wave*.025;
            float soil = dot(tex2D(_SoilTex, position * .65).rgb, float3(.299,.587,.114));
            float3 ground = CampusGroundColour(position,_GroundColor.rgb,_GroundShade.rgb,_GroundDry.rgb) * lerp(.94,1.04,soil);
            float sand = sin(shore*3.14159) * .34;
            output.Albedo = lerp(lerp(ground,_SandColor.rgb,sand),water,shore);
            output.Normal = normalize(float3(sin(position.x*6.2+position.y*3.3+flow*4.0)*.065*shore,
                cos(position.y*5.4-position.x*2.7-flow*3.2)*.065*shore,1));
            output.Metallic = 0;
            output.Smoothness = lerp(.035,_Glossiness,shore);
            output.Alpha = 1;
        }
        ENDCG
    }
    Fallback "Diffuse"
}

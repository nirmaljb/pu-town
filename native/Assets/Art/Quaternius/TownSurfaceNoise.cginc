// Original, deterministic surface shading. Noise never moves gameplay geometry.
float TownHash(float2 samplePosition)
{
    samplePosition = frac(samplePosition * float2(123.34, 456.21));
    samplePosition += dot(samplePosition, samplePosition + 45.32);
    return frac(samplePosition.x * samplePosition.y);
}
float TownNoise(float2 samplePosition)
{
    float2 cell = floor(samplePosition);
    float2 local = frac(samplePosition);
    local = local * local * (3.0 - 2.0 * local);
    return lerp(lerp(TownHash(cell), TownHash(cell + float2(1, 0)), local.x),
                lerp(TownHash(cell + float2(0, 1)), TownHash(cell + 1), local.x), local.y);
}
float TownMottle(float2 samplePosition)
{
    return TownNoise(samplePosition) * .60 + TownNoise(samplePosition * 2.03 + 17.2) * .28 + TownNoise(samplePosition * 4.01 + 39.6) * .12;
}
float3 TownGroundColour(float2 position, float3 grass, float3 shade, float3 dry)
{
    float broad = TownMottle(position * .47);
    float detail = TownNoise(position * 8.1);
    float warmPatch = smoothstep(.65, .87, TownNoise(position * .22 + 61.5));
    float3 colour = lerp(shade, grass, smoothstep(.12, .82, broad));
    colour = lerp(colour, dry, warmPatch * .30);
    return colour * lerp(.94, 1.04, detail);
}

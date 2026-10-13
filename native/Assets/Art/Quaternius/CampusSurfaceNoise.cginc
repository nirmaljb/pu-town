// Original, deterministic surface shading. Noise never moves gameplay geometry.
float CampusHash(float2 samplePosition)
{
    samplePosition = frac(samplePosition * float2(123.34, 456.21));
    samplePosition += dot(samplePosition, samplePosition + 45.32);
    return frac(samplePosition.x * samplePosition.y);
}
float CampusNoise(float2 samplePosition)
{
    float2 cell = floor(samplePosition);
    float2 local = frac(samplePosition);
    local = local * local * (3.0 - 2.0 * local);
    return lerp(lerp(CampusHash(cell), CampusHash(cell + float2(1, 0)), local.x),
                lerp(CampusHash(cell + float2(0, 1)), CampusHash(cell + 1), local.x), local.y);
}
float CampusMottle(float2 samplePosition)
{
    return CampusNoise(samplePosition) * .60 + CampusNoise(samplePosition * 2.03 + 17.2) * .28 + CampusNoise(samplePosition * 4.01 + 39.6) * .12;
}
float3 CampusGroundColour(float2 position, float3 grass, float3 shade, float3 dry)
{
    float broad = CampusMottle(position * .47);
    float detail = CampusNoise(position * 8.1);
    float warmPatch = smoothstep(.65, .87, CampusNoise(position * .22 + 61.5));
    float3 colour = lerp(shade, grass, smoothstep(.12, .82, broad));
    colour = lerp(colour, dry, warmPatch * .30);
    return colour * lerp(.94, 1.04, detail);
}

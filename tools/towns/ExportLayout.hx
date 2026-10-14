import com.watabou.towngenerator.building.Model;
import com.watabou.towngenerator.building.CurtainWall;
import openfl.geom.Point;

/** Headless serialization of the pinned upstream model; does not construct a Stage. */
class ExportLayout {
    static function points(values:Array<Point>):Array<Dynamic> {
        return values == null ? [] : [for (p in values) {x:p.x, y:p.y}];
    }
    static function wall(value:CurtainWall):Dynamic {
        return value == null ? null : {
            points:points(value.shape), segments:value.segments,
            gates:points(value.gates), towers:points(value.towers)
        };
    }
    static function main() {
        var args = Sys.args();
        if (args.length != 2) throw "Expected size and positive seed";
        var size = Std.parseInt(args[0]), seed = Std.parseInt(args[1]);
        if (size == null || size < 6 || size > 40 || seed == null || seed <= 0)
            throw "Invalid size or seed";
        haxe.Log.trace = function(value:Dynamic, ?info:haxe.PosInfos) {
            Sys.stderr().writeString(Std.string(value)+"\n");
        };
        var model = new Model(size, seed);
        var patches:Array<Dynamic> = [];
        for (index in 0...model.patches.length) {
            var patch = model.patches[index];
            patches.push({
                index:index, withinCity:patch.withinCity, withinWalls:patch.withinWalls,
                ward:Type.getClassName(Type.getClass(patch.ward)).split(".").pop(),
                label:patch.ward.getLabel(), points:points(patch.shape),
                geometry:[for (shape in patch.ward.geometry) points(shape)]
            });
        }
        Sys.println(haxe.Json.stringify({
            schemaVersion:1, generator:"watabou/TownGeneratorOS",
            commit:"7fbc87a9398cc508af24de93f79cf2ad027f352b", size:size, seed:seed,
            center:{x:model.center.x,y:model.center.y}, radius:model.cityRadius,
            plazaIndex:model.plaza == null ? null : model.patches.indexOf(model.plaza),
            citadelIndex:model.citadel == null ? null : model.patches.indexOf(model.citadel),
            patches:patches, gates:points(model.gates), border:wall(model.border), wall:wall(model.wall),
            streets:[for (shape in model.streets) points(shape)],
            roads:[for (shape in model.roads) points(shape)],
            arteries:[for (shape in model.arteries) points(shape)]
        }));
    }
}

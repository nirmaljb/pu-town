"""Authoring boundary checks against the two actual published town layouts."""
from copy import deepcopy
import json
import math
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parent))
import publish


class TownGeometryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.maps={mid:json.loads((publish.ROOT/'towns'/mid/'layout.json').read_text()) for mid in publish.MAPS}

    def test_each_art_building_blocks_its_full_footprint_and_keeps_shared_seats_open(self):
        for mid,data in self.maps.items():
            with self.subTest(map=mid):
                publish.validate(data);walk=publish.Walkability(data)
                for b in data['buildings']:
                    self.assertFalse(walk.open(b['x']+b['width']/2,b['y']+b['height']/2),b['id'])
                    self.assertFalse(walk.open(b['x']+.01,b['y']+.01),b['id'])
                self.assertTrue(all(walk.open(s['x'],s['y']) for s in data['meeting']['seats']))

    def test_seat_and_public_paths_are_collision_clear_and_meet_the_outward_target(self):
        for mid,data in self.maps.items():
            with self.subTest(map=mid):
                report=json.loads((publish.ROOT/'towns'/mid/'reachability.json').read_text())
                self.assertTrue(report['allSitesReachable'])
                self.assertGreaterEqual(report['maximumMeetingTravelSeconds'],15)
                self.assertLessEqual(report['maximumMeetingTravelSeconds'],20)
                walk=publish.Walkability(data)
                for route in report['routes']:
                    for a,b in zip(route['points'],route['points'][1:]):
                        self.assertTrue(walk.segment((a['x'],a['y']),(b['x'],b['y'])),route['site'])

    def test_source_market_props_and_groves_never_become_house_obstacles(self):
        for mid,data in self.maps.items():
            raw=json.loads((publish.ROOT/'towns'/mid/'watabou.json').read_text())
            for building in data['buildings']:
                self.assertNotIn(raw['patches'][building['sourcePatch']]['ward'],('Market','Park','Ward'))

    def test_market_town_has_a_reachable_outdoor_market_site(self):
        data = self.maps['market']
        markets = [site for site in data['landmarks'] if site['kind'] == 'market']
        self.assertGreaterEqual(len(markets), 1, 'Market Town needs a public market, beyond its houses.')
        walk = publish.Walkability(data)
        for site in markets:
            self.assertTrue(walk.open(site['entry']['x'], site['entry']['y']))

    def test_wells_leave_room_for_every_retained_seat(self):
        for data in self.maps.values():
            for well in (site for site in data['landmarks'] if site['kind'] == 'well'):
                centre = (well['x'] + well['width']/2, well['y'] + well['height']/2)
                for seat in data['meeting']['seats']:
                    self.assertGreaterEqual(math.dist(centre, (seat['x'], seat['y'])), 150,
                                            'Well canopy and stones must leave every seated Avatar clear.')

    def test_outdoor_disabled_tasks_cannot_accidentally_publish_active_workload(self):
        data=deepcopy(self.maps['woodland']);data['tasksEnabled']=True
        with self.assertRaisesRegex(ValueError,'Tasks disabled'):publish.validate(data)
        data=deepcopy(self.maps['woodland']);data['interiors']=[dict(id='house')]
        with self.assertRaisesRegex(ValueError,'outdoor-only'):publish.validate(data)

    def test_publication_rejects_an_artwork_collision_mismatch(self):
        data=deepcopy(self.maps['market']);data['buildings'][0]['width']+=10
        with self.assertRaisesRegex(ValueError,'footprints differ'):publish.validate(data)

    def test_authoring_checker_rejects_a_landmark_inside_a_solid_house(self):
        data=deepcopy(self.maps['woodland']);building=data['buildings'][0]
        data['landmarks'][0]['entry']=dict(x=building['x']+building['width']/2,y=building['y']+building['height']/2)
        with self.assertRaisesRegex(ValueError,'Blocked public/Seat anchor'):publish.reachability(data)

    def test_open_obstacle_edges_match_server_rectangle_convention(self):
        data=deepcopy(self.maps['woodland'])
        data['obstacles']=[dict(id='probe',kind='building',x=500,y=500,width=300,height=300)]
        walk=publish.Walkability(data)
        self.assertTrue(walk.open(500-publish.FOOT,650))
        self.assertFalse(walk.open(500-publish.FOOT+.001,650))


if __name__=='__main__':unittest.main()

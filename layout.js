"use strict";

const airportLayouts = (() => {
  const regional = {
    airfield: {runwayZ: -46, taxiwayZ: -23.2, standZ: -4.75},
    terminal: {floor: .78, halfWidth: 37.95, back: 8.18, front: 28.91, cafeBoundaryX: -13.1, cafeDoorX: -14.48},
    gates: [{id: "A01", x: -25}, {id: "A02", x: 0}, {id: "A03", x: 25}],
    checkIn: {
      front: 22.14, width: 4.95, deskZ: 21.25, sortingZ: 20.14, transfer: [39.2, .22, 6.15],
      banks: [
        {id: "check-in-1", x: 18, deskOffsets: [-2.2, 1.23]},
        {id: "check-in-2", x: 25.2, deskOffsets: [-2.54, .89]},
        {id: "check-in-3", x: 32.5, deskOffsets: [-2.98, .45]}
      ]
    },
    security: {
      front: 23.25, width: 4.3, checkpointZ: 20.7, portalOffsetX: 1.05, portalWidth: .88, exitZ: 19.10,
      belt: {offsetX: -.75, surfaceHeight: .615, entryZ: 22.61, exitZ: 19.44},
      banks: [{id: "security-1", x: -7.2}, {id: "security-2", x: -.7}, {id: "security-3", x: 5.8}]
    },
    baggageClaim: {
      left: -52.4, doorZ: 17.7, doorWidth: 2.5, exitX: -39.8, exitWidth: 1.65,
      carousels: [
        {id: "carousel-1", number: 1, x: -50.6, z: 25.05},
        {id: "carousel-2", number: 2, x: -50.6, z: 12.35}
      ]
    },
    sharedBenches: [-12.5, 12.5].flatMap((x, side) => [9.75, 11.75, 13.75].map((z, row) =>
      ({id: "shared-bench-" + (side * 3 + row + 1), x, z}))),
    cafeTables: [-30.8, -27.2, -23.6, -20.0, -16.8].map((x, index) =>
      ({id: "cafe-table-" + (index + 1), x, z: x < -25 ? 24.25 : 23.35}))
  };
  const starter = {
    ...regional,
    gates: regional.gates.slice(0, 2),
    checkIn: {...regional.checkIn, banks: regional.checkIn.banks.slice(0, 2).map(bank => ({...bank, deskOffsets: [0]}))},
    security: {...regional.security, banks: regional.security.banks.slice(0, 2)},
    baggageClaim: {...regional.baggageClaim, carousels: regional.baggageClaim.carousels.slice(0, 1)}
  };
  return {regional, starter};
})();

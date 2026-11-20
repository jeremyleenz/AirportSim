"use strict";

const airport = (() => {
  const {Mesh} = world;
  const gates = [-25, 0, 25].map((x, i) => ({x, name: "A0" + (i + 1)}));
  const colors = {
    grass: "#8fa486", asphalt: "#545f60", apron: "#9ca7a3", concrete: "#deded0",
    warm: "#e9e4d5", frame: "#506c70", glass: "#90babb", pale: "#d9e7df",
    white: "#f4f2df", paint: "#efbf62", ink: "#293e45", teal: "#4b847d"
  };
  const {grass, asphalt, apron, concrete, warm, frame, glass, pale, white, paint, ink, teal} = colors;
  const floor = .78;
  const road = -36.5;
  const checkInQueue = {centers: [18, 25.2, 32.5], z: 24, width: 4.95, depth: 1.87};
  const securityQueue = {centers: [-7.2, -.7, 5.8], z: 24.65, width: 4.3, depth: 1.65};
  let seed = 561;
  function random() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  function curve(points, steps = 16) {
    const result = [];
    for (let i = 0; i <= steps; i++) {
      let t = i / steps;
      let p = points;
      while (p.length > 1) p = p.slice(0, -1).map((v, n) => v.map((c, axis) => c + (p[n + 1][axis] - c) * t));
      result.push(p[0]);
    }
    return result;
  }

  const digitSegments = {
    "0": [0, 1, 2, 3, 4, 5], "1": [1, 2], "2": [0, 1, 6, 4, 3],
    "7": [0, 1, 2], "9": [0, 1, 2, 3, 5, 6]
  };
  function runwayNumber(mesh, text, x, z, direction) {
    const strokes = [[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [1, 2]], [[1, 2], [0, 2]],
      [[0, 2], [0, 1]], [[0, 1], [0, 0]], [[0, 1], [1, 1]]];
    [...text].forEach((digit, i) => {
      for (const s of digitSegments[digit]) {
        const line = strokes[s].map(([u, v]) => [x + direction * (1 - v) * 1.37, z + direction * (u + i * 1.7 - 1.35) * 1.25]);
        mesh.line(...line, .29, .041, white);
      }
    });
  }

  function ground() {
    const mesh = new Mesh();
    mesh.rect(0, -.08, 0, 560, 560, grass);
    const grassColors = ["#90a688", "#8ba184", "#93a989", "#8da382"];
    for (let i = -9; i <= 9; i++) mesh.rect(i * 12 + 6, -.076, -10, 12, 145, grassColors[(i + 12) % 4]);
    mesh.rect(0, .005, road, 102, 15.5, "#707b73");
    mesh.rect(0, .012, road, 100, 13.5, "#4c575a");
    for (const z of [road - 6.15, road + 6.15]) mesh.rect(0, .025, z, 98, .16, white);
    for (let x = -45; x < 47; x += 7.4) mesh.rect(x, .026, road, 3.55, .2, white);
    for (const x of [-32.5, 32.5]) {
      for (let n = -3; n <= 3; n++) mesh.rect(x, .029, road + n * .76, 5.2, .18, "#909994");
    }
    for (let x = -48; x <= 48; x += 2) {
      for (const z of [road - 6.7, road + 6.7]) mesh.rect(x, .024, z, .15, .25, "#a4abb1");
    }
    runwayNumber(mesh, "09", -38.5, road, 1);
    runwayNumber(mesh, "27", 38.5, road, -1);

    mesh.rect(0, .013, -23.2, 99, 6.7, asphalt);
    for (const x of [-45, 45]) {
      mesh.rect(x, .014, -30, 9, 12.5, asphalt);
      mesh.path(curve([[x, -34], [x, -22], [x * .83, -23.2]]), .16, .026, paint);
    }
    mesh.rect(0, .018, -23.2, 74.8, .15, paint);
    mesh.rect(0, .009, -7.35, 85, 23.5, apron);
    mesh.rect(0, .012, -18.4, 85, 1.4, "#858f8c");
    mesh.rect(0, .015, -17.7, 84.9, .16, white);
    for (let x = -39; x < 43; x += 4) mesh.rect(x, .018, -17.3, 2.4, .10, "#dce3d3");
    for (let x = -42.5; x <= 43; x += 5) mesh.rect(x, .011, -7.1, .052, 22, "#899593");
    for (let z = -15; z <= 8; z += 3.8) mesh.rect(0, .012, z, 84.8, .055, "#8a9691");

    for (const {x} of gates) {
      mesh.path(curve([[x - 9, -23.2], [x, -23.2], [x, -16]]), .16, .03, paint);
      mesh.line([x, -16], [x, 3.45], .14, .028, paint);
      mesh.rect(x, .031, 2.2, 2.25, .17, paint);
      mesh.path([[x - 10.7, 5.5], [x - 10.7, -11.3], [x - 8.8, -15], [x + 8.8, -15],
        [x + 10.7, -11.3], [x + 10.7, 5.5]], .1, .031, "#dae0d2");
      const hatch = "#bf755b";
      const a = x - 7.7;
      mesh.path([[a, 3.9], [a + 4.8, 3.9], [a + 4.8, 7.9], [a, 7.9], [a, 3.9]], .12, .033, hatch);
      for (let n = 0; n < 5; n++) mesh.line([a + n * .85, 7.9], [a + n * .85 + .85, 3.9], .105, .034, hatch);
      for (const side of [-1, 1]) {
        for (let n = 0; n < 3; n++) mesh.rect(x + side * (1.7 + n * .48), .031, -13.3, .28, .14, white);
      }
    }

    mesh.rect(0, .02, 31.0, 89, 6.5, "#a5ada1");
    mesh.rect(0, .025, 36.2, 104, 7.8, asphalt);
    mesh.rect(0, .031, 32.55, 93, .14, "#d4d4bb");
    mesh.rect(0, .032, 39.85, 97, .13, "#bac4b9");
    for (let x = -48; x < 52; x += 3.7) mesh.rect(x, .033, 36.0, 1.7, .13, "#dce0cf");
    for (const x of [-14, 11]) {
      for (let n = -3; n <= 3; n++) mesh.rect(x + n * .58, .033, 34.15, .26, 2.55, white);
    }
    mesh.rect(-26.5, .008, 46, 39, 11.5, "#64726d");
    mesh.rect(-26.5, .012, 50.2, 38, .12, "#d9dcbd");
    for (let x = -44; x < -7; x += 2.6) mesh.rect(x, .014, 48, .09, 4.4, "#c5c9aa");
    mesh.rect(23, .013, 45.5, 37, 6.6, "#b0b8a5");
    mesh.rect(23, .017, 46.2, 37, 3.4, "#8c9e85");
    for (const x of [-40, -33, -24, -7, 5, 24, 38]) {
      mesh.rect(x, .035, 30.9, 3.6, 1.45, "#798e77");
      mesh.rect(x, .037, 31.67, 3.8, .13, concrete);
    }
    return mesh;
  }

  function wall(mesh, x, z, length, alongX, height) {
    const span = (a, b, y, h, color, thickness) => {
      mesh.box(x + (alongX ? a : 0), y, z + (alongX ? 0 : a),
        alongX ? b : thickness, h, alongX ? thickness : b, color);
    };
    span(0, length, floor, .22, frame, .23);
    span(0, length, floor + .22, height - .37, glass, .155);
    span(0, length, floor + height - .15, .15, "#d8e5db", .27);
    span(0, length, floor + height * .46, .065, "#76999b", .19);
    for (let p = -length / 2 + .06; p < length / 2; p += 1.68) {
      span(p, .062, floor + .2, height - .22, frame, .21);
    }
  }

  function bench(mesh, x, z, color, direction = 1) {
    mesh.box(x, floor, z, 2.47, .19, .60, "#606a68");
    for (let i = -1; i <= 1; i++) {
      mesh.box(x + i * .86, floor + .19, z, .76, .13, .58, color);
      mesh.box(x + i * .86, floor + .25, z - direction * .25, .76, .31, .12, color);
    }
  }

  function planter(mesh, x, y, z, size = 1) {
    mesh.ring(x, y, z, .24 * size, .34 * size, .48 * size, "#b4b5a4", 6);
    mesh.ring(x, y + .45 * size, z, .36 * size, .22 * size, .53 * size, "#5c846a", 7);
    mesh.ring(x - .13 * size, y + .53 * size, z, .10 * size, .3 * size, .39 * size, "#749773", 7);
  }

  function desk(mesh, x, z, tint) {
    mesh.box(x, floor, z, 1.45, .65, .65, tint);
    mesh.box(x, floor + .64, z, 1.56, .11, .76, white);
    mesh.box(x + .31, floor + .75, z - .1, .29, .27, .095, ink);
    mesh.box(x + .31, floor + .81, z - .047, .21, .13, .011, "#a7d4c9");
  }

  function bollard(mesh, x, z, y = floor) {
    mesh.ring(x, y, z, .12, .13, .07, frame, 6);
    mesh.ring(x, y + .07, z, .043, .048, .39, "#56686b", 5);
    mesh.ring(x, y + .44, z, .07, .07, .06, "#95ada8", 6);
  }

  function queue(mesh, x, z, w, d) {
    for (let row = 0; row < 3; row++) {
      const zRow = z + (row - 1) * d / 2;
      mesh.box(x, floor + .445, zRow, w, .049, .041, "#63817f");
      for (const delta of [-w / 2, 0, w / 2]) bollard(mesh, x + delta, zRow);
    }
  }

  function bridge(mesh, x) {
    const pivot = x - 4.7;
    mesh.box(pivot, .69, 8.2, 2.52, 2.45, 2.18, "#a9bfba");
    mesh.box(pivot, 3.13, 8.25, 2.56, .19, 2.36, white);
    mesh.box(pivot, .10, 5.43, .45, 1.8, .51, frame);
    mesh.box(pivot + .9, 1.51, 5.61, 1.7, 1.34, 4.65, "#86a5a9", -.39);
    mesh.box(pivot + .9, 2.85, 5.61, 1.9, .15, 4.71, "#e2ebe1", -.39);
    mesh.box(x - 2.2, 1.39, 3.69, 2.12, 1.27, 1.58, "#779398", -.25);
    mesh.box(x - 2.2, 2.66, 3.69, 2.15, .135, 1.65, "#cadcd5", -.25);
  }

  function terminal() {
    const mesh = new Mesh();
    mesh.box(0, .031, 18.5, 76, .75, 21, "#bdc9c1");
    mesh.box(0, .46, 18.5, 76.3, .32, 21.24, "#ecede1");
    mesh.rect(0, floor + .006, 18.5, 75.8, 20.85, warm);
    mesh.rect(0, floor + .010, 17.1, 75.8, 3.6, "#e9ece3");
    for (let x = -37.8; x < 38; x += 1.9) mesh.rect(x, floor + .013, 18.5, .032, 20.8, "#c5cec6");
    for (let z = 8.3; z < 29; z += 1.42) mesh.rect(0, floor + .015, z, 75.7, .034, "#c8cfc5");
    wall(mesh, 0, 8.18, 75.95, true, 2.6);
    wall(mesh, 37.95, 18.5, 20.5, false, 2.52);
    wall(mesh, -37.95, 18.5, 20.5, false, 1.15);
    wall(mesh, -23, 28.91, 28, true, .72);
    wall(mesh, 23, 28.91, 28, true, .72);

    for (const {x} of gates) {
      bridge(mesh, x);
      mesh.rect(x + .4, floor + .018, 11.8, 19.15, 5.45, "#a6b9b7");
      mesh.rect(x + .4, floor + .020, 14.36, 19.05, .11, "#e3e8d1");
      for (const dx of [-5.5, -2.3, 1.1, 4.3]) {
        bench(mesh, x + dx, 10.25, "#628388");
        bench(mesh, x + dx, 12.8, "#55797d", -1);
      }
      desk(mesh, x + 8.2, 10.4, teal);
      for (const z of [9.7, 14.1]) planter(mesh, x - 8.15, floor, z, 1.3);
      mesh.box(x + 8.15, floor + .94, 9.5, .09, 1.12, .09, frame);
      mesh.box(x + 8.15, floor + 1.8, 9.5, 1.5, .36, .14, ink);
      mesh.box(x + 8.15, floor + 1.89, 9.599, 1.22, .12, .06, paint);
    }

    // Coffee shop, security, and check-in are separate spaces in the cutaway.
    mesh.rect(-25, floor + .025, 22.9, 19.4, 7.7, "#c39569");
    for (let z = 19.2; z < 26.7; z += .34) mesh.rect(-25, floor + .029, z, 19.25, .027, "#ad825c");
    mesh.box(-25, floor, 19.05, 19.5, 1.75, .21, "#e4d2af");
    mesh.box(-25, floor + 1.72, 19.05, 19.55, .14, .33, "#e7e3d2");
    mesh.box(-29.2, floor, 20.07, 8, .64, .86, "#8c6046");
    mesh.box(-29.2, floor + .63, 20.07, 8.06, .13, .98, "#f3e8cf");
    for (let i = 0; i < 7; i++) mesh.box(-32.6 + i * .51, floor + .76, 20.21, .26, .17, .28,
      ["#79614b", "#c88454", "#eee2bf"][i % 3]);
    for (const x of [-30.8, -27.2, -23.6, -20.0, -16.8]) {
      const z = x < -25 ? 24.25 : 23.35;
      mesh.ring(x, floor, z, .17, .14, .6, "#7b6853", 8);
      mesh.ring(x, floor + .6, z, .58, .58, .09, "#f0e8d5", 12);
      for (const dz of [-.91, .91]) {
        mesh.box(x, floor, z + dz, .49, .35, .47, "#8c6f52");
        mesh.box(x, floor + .27, z + dz * 1.18, .49, .34, .10, "#9f744b");
      }
    }
    planter(mesh, -15.8, floor, 26.1, 1.3);
    mesh.rect(-.8, floor + .022, 23.18, 22.4, 8.15, "#c1cec8");
    mesh.rect(-.8, floor + .025, 19.26, 22.3, .19, teal);
    for (const x of securityQueue.centers) {
      mesh.box(x, floor, 20.3, 3.05, 1.43, .24, "#e3e8dc");
      mesh.box(x - 1.2, floor, 21, .95, .56, 3.75, "#596d70");
      mesh.box(x - 1.2, floor + .56, 21, .76, .055, 3.7, "#364951");
      mesh.box(x - 1.2, floor + .55, 20.7, 1.08, .69, .85, "#799a93");
      mesh.box(x + .55, floor, 20.7, .14, 1.36, .34, teal);
      mesh.box(x + 1.56, floor, 20.7, .14, 1.36, .34, teal);
      mesh.box(x + 1.05, floor + 1.32, 20.7, 1.15, .17, .34, teal);
      queue(mesh, x, securityQueue.z, securityQueue.width, securityQueue.depth);
    }

    mesh.rect(24.75, floor + .024, 22.9, 21.7, 7.7, "#d4d9ce");
    mesh.box(24.75, floor, 19.45, 21.9, 1.25, .22, "#93b6ae");
    mesh.box(24.75, floor + 1.24, 19.45, 21.93, .15, .32, "#e8e8d2");
    for (let n = 0; n < 6; n++) desk(mesh, 15.8 + n * 3.43, 20.8, n % 2 ? "#87a5a2" : "#6c9b91");
    for (const x of checkInQueue.centers) queue(mesh, x, checkInQueue.z, checkInQueue.width, checkInQueue.depth);
    for (const x of [-34.5, -12.8, 12.4, 35.6]) planter(mesh, x, floor, 26.95, 1.3);

    for (const x of [-8.3, -3.6, 3.6, 8.3]) {
      mesh.box(x, .05, 29.81, .24, 2.93, .28, frame);
      mesh.box(x, .05, 28.28, .25, 2.93, .27, frame);
    }
    mesh.box(0, 2.95, 29.2, 18.95, .27, 2.85, "#dbe7d8");
    mesh.box(0, 2.82, 30.68, 18.99, .24, .13, teal);
    for (let x = -8.7; x < 9; x += 1.48) mesh.box(x, 3.218, 29.24, .095, .055, 2.69, "#a8bbb2");
    return mesh;
  }

  function tree(mesh, x, z, s) {
    mesh.ring(x, 0, z, .13 * s, .095 * s, .95 * s, "#726e53", 6);
    mesh.ring(x, .64 * s, z, .53 * s, .82 * s, .48 * s, "#658366", 8);
    mesh.ring(x, 1.12 * s, z, .82 * s, .57 * s, .62 * s, "#779773", 8);
    mesh.ring(x, 1.74 * s, z, .57 * s, .14 * s, .77 * s, "#85a47f", 8);
  }

  function tower(mesh, x, z) {
    mesh.box(x, .015, z, 6.4, .23, 6.4, "#b7beb0");
    mesh.ring(x, .22, z, 2.48, 2.37, .6, "#c2cec4", 8);
    mesh.ring(x, .82, z, 1.58, 1.23, 6.72, "#b1c5bf", 8);
    mesh.box(x - 1.12, 1, z + .34, .10, 6.04, .51, "#759792");
    mesh.ring(x, 7.54, z, 1.42, 2.42, 1.13, "#a4b9b2", 8);
    mesh.ring(x, 8.67, z, 2.44, 2.44, .21, "#e4ebda", 8);
    mesh.ring(x, 8.88, z, 2.31, 2.5, 1.26, "#577f86", 8);
    for (let n = 0; n < 8; n++) {
      const angle = n * Math.PI / 4;
      mesh.box(x + 2.18 * Math.cos(angle), 8.91, z + 2.18 * Math.sin(angle), .085, 1.2, .09, "#a0b9b2");
    }
    mesh.ring(x, 10.14, z, 2.57, 2.46, .27, "#e3e9da", 8);
    mesh.ring(x, 10.41, z, .095, .065, 1.82, "#627578", 6);
    mesh.box(x, 11.79, z, 1.36, .11, .20, "#ca8062", .40);
  }

  function lamp(mesh, x, z, h, dual = false) {
    mesh.box(x, .025, z, .35, .21, .35, "#969e92");
    mesh.box(x, .2, z, .11, h, .11, frame);
    mesh.box(x, h + .16, z + (dual ? 0 : .36), .09, .12, dual ? 1.44 : .79, frame);
    mesh.box(x, h + .066, z + .72, .39, .15, .38, "#cbd8cb");
    if (dual) mesh.box(x, h + .066, z - .72, .39, .15, .38, "#cbd8cb");
  }

  function details() {
    const mesh = new Mesh();
    tower(mesh, -45.5, 1.4);
    for (const x of [-42, -13, 13, 42]) lamp(mesh, x, 7.45, 5.2, true);
    for (const x of [-41, -20, 0, 20, 41]) lamp(mesh, x, 39.9, 2.9);
    for (const x of [-40, -33, -24, -7, 5, 24, 38]) tree(mesh, x, 30.9, .72);
    for (let i = 0; i < 120; i++) {
      const x = -63 + random() * 126, z = -60 + random() * 116;
      const outside = (z < -44 && (x > 8 || x < -32)) || (z > 42 && (x < -47 || x > -4))
        || (x < -53 && z > -25) || (x > 48 && z < 29 && z > -18);
      if (outside) tree(mesh, x, z, .62 + random() * .89);
    }
    for (const x of [9, 16, 23, 30, 37]) tree(mesh, x, 45.8, .9);
    for (const {x} of gates) {
      for (const dx of [-7.8, -6.7, 6.6, 8]) {
        mesh.ring(x + dx, 0, 4.6 + (dx > 0 ? -.8 : 0), .22, .04, .44, "#d79050", 7);
      }
    }
    mesh.box(45.5, .02, 15, 6, .27, 8.9, "#b2b9ad");
    mesh.box(45.5, .29, 14.25, 4.9, 2.4, 6.35, "#a2bab4");
    mesh.box(45.5, 2.68, 14.25, 5.18, .25, 6.6, "#dce4d6");
    mesh.box(43.04, .32, 14.5, .055, 1.62, 3.63, "#627d80");
    mesh.box(45.5, .31, 17.43, 3.6, 1.66, .041, "#718c8d");
    for (let n = 0; n < 5; n++) mesh.box(45.5, .6 + n * .24, 17.46, 3.55, .055, .035, "#b6c7bc");
    return mesh;
  }

  function aircraft(livery) {
    const mesh = new Mesh();
    const body = "#f3f4e9", belly = "#bfced0", cabin = "#304f5e";
    const silver = "#cddbdc", rim = "#879ca4";
    const rings = [
      [-9, .10, .10, .16], [-8.25, .44, .43, .25], [-6.6, .94, .82, .11],
      [-4.8, 1.19, 1.11, 0], [5.1, 1.19, 1.11, 0], [6.9, 1.04, .98, -.12],
      [7.75, .78, .70, -.29], [8.48, .41, .42, -.39], [8.68, .09, .135, -.42]
    ];
    const sides = 24;
    const point = ([z, rx, ry, dy], a) => [rx * Math.cos(a), 1.73 + dy + ry * Math.sin(a), z];
    for (let i = 1; i < rings.length; i++) {
      for (let n = 0; n < sides; n++) {
        const a = n * 2 * Math.PI / sides, b = (n + 1) * 2 * Math.PI / sides;
        const steps = [point(rings[i - 1], a), point(rings[i - 1], b), point(rings[i], b), point(rings[i], a)];
        mesh.face(steps, n > 13 && n < 22 ? belly : body);
      }
    }
    for (const side of [-1, 1]) {
      const wing = [[side * .86, -.1], [side * 2.95, -.38], [side * 9.43, -5.16],
        [side * 9.2, -5.78], [side * 6.65, -5.12], [side * 1.06, -3.78]];
      mesh.flat(wing, 1.55, silver);
      for (let i = 1; i <= wing.length; i++) {
        const a = wing[i - 1], b = wing[i % wing.length];
        mesh.face([[a[0], 1.55, a[1]], [b[0], 1.55, b[1]], [b[0], 1.42, b[1]], [a[0], 1.42, a[1]]], rim);
      }
      mesh.face([[side * 9.02, 1.54, -5.02], [side * 9.38, 2.67, -5.43],
        [side * 9.66, 2.67, -5.99], [side * 9.18, 1.54, -5.75]], livery, [side * .6, .6, .17]);
      mesh.flat([[side * .24, -6.33], [side * 3.75, -8.39], [side * 3.71, -8.94],
        [side * .17, -8.43]], 2.03, silver);
      mesh.box(side * 3.0, 1.01, -.77, .43, .59, 1.51, "#a5b9bd");
      const u = side * 3.0;
      const tube = (r, a, z) => [u + r * Math.cos(a), 1.02 + r * Math.sin(a), z];
      for (let n = 0; n < 16; n++) {
        const a = n * Math.PI / 8, b = (n + 1) * Math.PI / 8;
        mesh.face([tube(.37, a, -2.05), tube(.37, b, -2.05), tube(.58, b, -.36), tube(.58, a, -.36)], body);
        mesh.face([tube(.58, a, -.36), tube(.58, b, -.36), tube(.52, b, .59), tube(.52, a, .59)], body);
        mesh.face([tube(.52, a, .59), tube(.52, b, .59), tube(.39, b, .61), tube(.39, a, .61)], rim, [0, 0, 1]);
      }
      mesh.face(Array.from({length: 16}, (_, n) => tube(.39, n * Math.PI / 8, .598)), "#293f49", [0, 0, 1]);
      mesh.box(side * .9, .10, -1.49, .28, .46, .43, ink);
      mesh.box(side * .9, .49, -1.49, .13, .51, .13, rim);

      for (let z = -5.1; z <= 5.27; z += .48) {
        const edge = side * (z < -4.7 ? 1.106 : 1.174);
        mesh.face([[edge, 1.89, z], [edge, 2.07, z], [edge, 2.085, z + .125],
          [edge, 1.9, z + .165]], cabin, [side, .13, 0]);
      }
      mesh.face([[side * 1.023, 2.08, 6.17], [side * .974, 2.28, 6.21],
        [side * .716, 2.19, 7.12], [side * .776, 1.94, 7.22]], cabin, [side, .3, .3]);
      mesh.face([[side * .08, 1.89, 7.74], [side * .08, 2.11, 7.42],
        [side * .663, 2.17, 7.17], [side * .726, 1.93, 7.34]], cabin, [side * .4, .4, .7]);
      mesh.face([[side * 1.21, 1.4, 3.66], [side * 1.21, 1.56, 3.66],
        [side * 1.19, 1.56, 5.36], [side * 1.156, 1.4, 5.36]], livery, [side, 0, 0]);
    }
    mesh.box(0, .10, 5.55, .24, .36, .37, ink);
    mesh.box(0, .43, 5.55, .12, .61, .12, rim);
    for (const side of [-1, 1]) {
      mesh.face([[side * .133, 2.01, -6.1], [side * .062, 5.64, -8.02],
        [side * .049, 5.57, -9.43], [side * .12, 1.97, -8.86]], livery, [side, .1, .07]);
      mesh.face([[side * .097, 3.16, -7.02], [side * .072, 4.73, -8.14],
        [side * .069, 4.71, -8.65], [side * .097, 3.17, -7.57]], "#e1eee2", [side, .1, .05]);
    }
    return mesh;
  }

  function vehicle(tint, truck = false) {
    const mesh = new Mesh();
    const length = truck ? 2.45 : 2.05;
    mesh.box(0, .18, 0, .99, .47, length, tint);
    mesh.box(0, .63, truck ? .58 : -.09, .88, truck ? .63 : .38, truck ? .92 : 1.02, "#799da3");
    mesh.box(0, truck ? 1.25 : 1.01, truck ? .58 : -.09, .91, .09, truck ? .94 : 1.04, tint);
    if (truck) mesh.box(0, .56, -.58, .94, .62, 1.1, "#b9c5bb");
    for (const side of [-1, 1]) {
      for (const z of [-.65, .65]) mesh.box(side * .46, .03, z, .18, .37, .36, "#293e42");
      mesh.box(side * .32, .46, length / 2, .16, .12, .025, "#ffffd8");
      mesh.box(side * .32, .47, -length / 2, .16, .10, .025, "#bd695e");
    }
    return mesh;
  }

  function traveler(tint, skin) {
    const mesh = new Mesh();
    mesh.ring(0, -.014, 0, .22, .22, .019, "#a8b2a9", 6);
    mesh.box(-.081, 0, 0, .109, .31, .137, "#475458");
    mesh.box(.081, 0, -.01, .109, .32, .137, "#454f54");
    mesh.ring(0, .26, 0, .154, .205, .31, tint, 6);
    mesh.ring(0, .57, .013, .113, .111, .14, skin, 8);
    mesh.ring(0, .69, .005, .11, .08, .058, "#4d5146", 7);
    mesh.box(.22, .02, -.12, .19, .235, .193, tint);
    return mesh;
  }

  function passengerActors(outfits, occupancy, now, lanes, walkTime) {
    const actors = [];
    function place({person, flight}, x, z, angle) {
      const style = person.index * 5 + flight.airline * 3;
      const offset = ((style % 11) - 5) * .013;
      actors.push({mesh: outfits[style % outfits.length], x: x + offset, y: floor,
        z: z - offset, angle, castShadow: false});
    }

    function placeQueue(people, queueLayout, activeLanes) {
      const columns = 10;
      const lanesFilled = Array(activeLanes).fill(0);
      people.forEach(entry => {
        const lane = entry.person.index % activeLanes;
        const slot = lanesFilled[lane]++;
        const row = Math.floor(slot / columns);
        const column = row % 2 ? columns - 1 - slot % columns : slot % columns;
        const x = queueLayout.centers[lane] + (column / (columns - 1) - .5) * (queueLayout.width - .44);
        const z = queueLayout.z - queueLayout.depth / 4 + row * queueLayout.depth / 2;
        place(entry, x, z, Math.PI);
      });
    }
    placeQueue(occupancy.checkIn, checkInQueue, checkInQueue.centers.length);
    placeQueue(occupancy.security, securityQueue, lanes);

    for (const entry of occupancy.concourse) {
      const {person, flight} = entry;
      const progress = (now - person.walkStarted) / walkTime;
      const start = -.7 + (person.index % 5 - 2) * .8;
      const end = gates[flight.gate].x + (person.index % 9 - 4) * .65;
      const x = start + (end - start) * progress;
      const z = 18.65 - progress * (2.75 + person.index % 5 * .11);
      place(entry, x, z, Math.atan2(end - start, -3));
    }

    const loungeRows = [9.28, 9.72, 10.79, 11.32, 11.86, 13.47, 14.05];
    const loungeColumns = 18;
    occupancy.gates.forEach((people, index) => {
      people.forEach(entry => {
        // Spread each manifest across the lounge without moving people when someone boards.
        const slot = entry.person.index * 37 % (loungeColumns * loungeRows.length);
        const x = gates[index].x + ((loungeColumns - 1) / 2 - slot % loungeColumns) * .82;
        const z = loungeRows[Math.floor(slot / loungeColumns)];
        place(entry, x, z, Math.PI);
      });
    });
    return actors;
  }

  function scene() {
    const fixed = [
      {mesh: ground(), castShadow: false},
      {mesh: terminal()},
      {mesh: details()}
    ];
    const vans = [
      vehicle("#e2e9dc", true), vehicle("#e4b260", true), vehicle("#7da5ad"),
      vehicle("#e0e4d6"), vehicle("#bb7e6c"), vehicle("#719692")
    ];
    const fleet = gates.flatMap(({x}, i) => [
      {mesh: vans[i % 2], x: x + 9, z: 2.0, angle: 1.2},
      {mesh: vans[1], x: x - 8.8, z: -.4, angle: -.24}
    ]);
    for (let i = 0; i < 12; i++) {
      if (i % 4 !== 2) fleet.push({mesh: vans[2 + i % 4], x: -42.6 + i * 2.6, z: 47.8, angle: Math.PI});
    }
    const traffic = Array.from({length: 5}, (_, i) => ({
      mesh: vans[2 + i % 4], z: i < 3 ? 34.55 : 37.65, angle: (i < 3 ? 1 : -1) * Math.PI / 2,
      offset: i * 22
    }));
    const outfits = ["#b66e5e", "#4b807e", "#c9a354", "#ece1ce", "#556e89", "#81936c", "#906d81"]
      .map((tint, i) => traveler(tint, ["#e5b896", "#bb8462", "#d19d7c", "#99684f"][i % 4]));
    const highlight = new Mesh().path([[-10.7, 5.45], [-10.7, -11.3], [-8.8, -15],
      [8.8, -15], [10.7, -11.3], [10.7, 5.45]], .23, .05, "#b6e0b3");
    return {fixed: [...fixed, ...fleet], traffic, outfits, highlight};
  }

  return {gates, aircraft, scene, passengerActors, floor, road};
})();

"use strict";

(() => {
  const $ = selector => document.querySelector(selector);
  const {gates, runwayZ, taxiwayZ, floor} = airport;
  const mobileLayout = window.matchMedia("(max-width: 760px), (pointer: coarse) and (max-height: 500px)");
  const game = $(".game");
  const currency = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", maximumFractionDigits: 0});
  const laneCost = 12500;
  const passengerFare = 41;
  const startMinutes = 8 * 60 + 42;
  const secondsPerMinute = 3.4;
  const minutesFromHoldingToBoarding = 40;
  const minutesFromBoardingToTakeoff = 30;
  const earliestPassengerArrival = 70;
  const latestPassengerArrival = 40;
  const takeoffWarningMinutes = 10;
  const inboundTaxiSpeed = 4;
  const pushbackEnd = .25;
  const runwayEntry = .62;
  const liftoff = .90;
  const holdingPosition = {x: 44, z: taxiwayZ, angle: -Math.PI / 2};
  const planeIcon = '<svg class="icon" aria-hidden="true"><use href="#plane"/></svg>';
  const airlines = [
    {code: "PL", symbol: "#197f79", ui: "#8fd8ca"},
    {code: "SA", symbol: "#bd6d43", ui: "#efb08b"},
    {code: "PA", symbol: "#5674a7", ui: "#a4bfe9"},
    {code: "NR", symbol: "#8b698c", ui: "#d3a9d3"}
  ];
  const routes = [
    ["Melbourne", 214, 96], ["Brisbane", 507, 90], ["Auckland", 318, 110],
    ["Hobart", 126, 86], ["Adelaide", 435, 102], ["Wellington", 201, 94]
  ];
  function makeFlight(route, airline, stage, gate, initialPassengers, boardingMinute,
    takeoffMinute = boardingMinute + minutesFromBoardingToTakeoff) {
    const [destination, number, passengers] = routes[route];
    const boardingAt = boardingMinute * secondsPerMinute;
    const takeoffAt = takeoffMinute * secondsPerMinute;
    const manifest = passengerFlow.manifest(passengers, initialPassengers,
      takeoffAt - earliestPassengerArrival * secondsPerMinute,
      takeoffAt - latestPassengerArrival * secondsPerMinute);
    return {destination, id: airlines[airline].code + number, airline, passengers, stage, gate, manifest, boardingAt, takeoffAt};
  }

  function makeArrival(route, airline, now) {
    const boardingMinute = Math.ceil(now / secondsPerMinute) + minutesFromHoldingToBoarding;
    return makeFlight(route, airline, "holding", null, null, boardingMinute);
  }

  const state = {
    cash: 124500, now: 0, speed: 1, paused: false, dispatched: 0, lanes: 2,
    missedPassengers: 0, delayMinutes: 0,
    nextArrival: 0, nextRoute: 3,
    flights: [
      makeFlight(0, 0, "boarding", 0, {boarded: 68, gateQueue: 8, gate: 20}, 0, 13),
      makeFlight(1, 1, "parked", 1, {gate: 19, cafe: 5, concourse: 12, security: 38, checkIn: 16}, 16),
      makeArrival(2, 2, 0)
    ],
    selected: "SA507", view: "flights", taxiIn: null, departure: null
  };
  const statusText = {
    parked: "At gate", boarding: "Boarding", closing: "Boarding closed", ready: "Ready", holding: "Holding",
    reserved: "Gate reserved", inbound: "Taxiing in", outbound: "Departing"
  };
  const flow = passengerFlow.create(state.flights, state.lanes);
  let occupancy = passengerFlow.snapshot(state.flights, flow);
  let occupancyDirty = false;

  let renderer, scene;
  let planes, laneClosed;
  try {
    renderer = world.createRenderer($("#scene"));
    scene = airport.scene();
    planes = airlines.map(airline => airport.aircraft(airline.symbol));
    const {centers, checkpointZ, portalOffsetX, portalWidth} = airport.terminalPaths.security;
    const closedLaneX = centers.at(-1) + portalOffsetX;
    const barrierZ = checkpointZ + .6;
    laneClosed = new world.Mesh()
      .box(closedLaneX, floor + .50, barrierZ, portalWidth + .18, .07, .105, "#b97054")
      .box(closedLaneX - portalWidth / 2, floor, barrierZ, .08, .56, .1, "#536b6c")
      .box(closedLaneX + portalWidth / 2, floor, barrierZ, .08, .56, .1, "#536b6c");
  } catch (error) {
    console.error(error);
    $("#map-error").hidden = false;
  }

  function createLabel(text, x, y, z, section) {
    const label = document.createElement("span");
    label.className = "map-note";
    label.textContent = text;
    const count = section ? addMapCount(label) : null;
    $("#map-labels").append(label);
    return {element: label, x, y, z, count, section};
  }
  function addMapCount(label) {
    const count = document.createElement("span");
    count.className = "map-count";
    label.append(count);
    return count;
  }
  const mapPins = gates.map(({x, name}, gate) => {
    const button = document.createElement("button");
    button.className = "map-gate";
    button.type = "button";
    button.innerHTML = "<i aria-hidden='true'></i>" + name;
    const count = addMapCount(button);
    button.addEventListener("click", () => {
      const flight = flightAtGate(gate);
      selectFromMap(flight?.id || state.flights.find(item => item.stage === "holding")?.id || "gate-" + gate, gate);
    });
    if (renderer) $("#map-labels").append(button);
    return {element: button, x: x + 2.9, y: 2.85, z: 7.93, count};
  });
  const mapSigns = renderer ? [
    createLabel("ENTRANCE", 0, 2.65, 31.4),
    createLabel("CAFÉ", -26, 1.84, 19.05, "cafe"),
    createLabel("SHARED SEATS", -12.5, .8, 19.2, "sharedSeats"),
    createLabel("SECURITY", -.7, 2.75, 19.1, "security"),
    createLabel("CHECK-IN", 25, 1.95, 23.1, "checkIn"),
    createLabel("DEPARTURES", 13.3, 1.65, 16.9, "concourse"),
    createLabel("RWY 09 / 27", -22, .05, runwayZ - 9.4)
  ] : [];
  const holdingPin = $("#map-holding");
  const holdingPinRoute = holdingPin.querySelector(".holding-route");
  const holdingPinTime = holdingPin.querySelector("time");
  const holdingPinPosition = {element: holdingPin, x: holdingPosition.x, y: 6.4, z: holdingPosition.z};
  holdingPin.addEventListener("click", () => {
    const flight = flightAtHoldingPoint();
    if (flight) selectFromMap(flight.id);
  });
  $("#lounge-counts").innerHTML = gates.map(({name}) => stat(name, 0)).join("");

  function announce(message) {
    $("#event").textContent = message;
  }

  function select(id, stand = null) {
    const arrival = state.flights.find(flight => flight.id === id && flight.stage === "holding");
    if (arrival) {
      const choice = stand ?? arrival.preferredGate ?? availableGate();
      if (choice >= 0 && !flightAtGate(choice)) arrival.preferredGate = choice;
    }
    state.selected = id;
    state.view = "flights";
    paint();
    requestDraw = true;
  }

  function showMobileView(view) {
    game.dataset.mobileView = view;
    $("#show-map").setAttribute("aria-pressed", String(view === "map"));
    $("#show-operations").setAttribute("aria-pressed", String(view === "operations"));
    requestDraw = true;
  }

  function revealFlight() {
    $("#flight-detail").scrollIntoView({block: "nearest"});
    $("#detail-title").focus({preventScroll: true});
  }

  function selectFromMap(id, stand = null) {
    select(id, stand);
    if (mobileLayout.matches) {
      showMobileView("operations");
      revealFlight();
    }
  }

  function notifyTab(view) {
    state.view = view;
    paint();
  }

  function flightAtGate(gate) {
    const departure = state.departure;
    const pushedBack = departure && movementProgress(departure) >= pushbackEnd ? departure.flight : null;
    return state.flights.find(flight => flight.gate === gate && flight !== pushedBack);
  }

  function isArriving({stage}) {
    return stage === "holding" || stage === "reserved" || stage === "inbound";
  }

  function flightAtHoldingPoint() {
    return state.flights.find(({stage}) => stage === "holding" || stage === "reserved");
  }

  function movementProgress({start, duration}) {
    return Math.min(1, (state.now - start) / duration);
  }

  function departureOnRunway() {
    return state.departure && movementProgress(state.departure) >= runwayEntry;
  }

  function taxiwayBusy() {
    return Boolean(state.taxiIn || (state.departure && !departureOnRunway()));
  }

  function availableGate() {
    return gates.findIndex((_, index) => !flightAtGate(index));
  }

  function selectedGate() {
    const flight = state.flights.find(item => item.id === state.selected);
    if (flight?.stage === "outbound" && flightAtGate(flight.gate) !== flight) return -1;
    if (flight?.gate != null) return flight.gate;
    if (flight?.stage === "holding") {
      if (flight.preferredGate === undefined) return availableGate();
      return flightAtGate(flight.preferredGate) ? -1 : flight.preferredGate;
    }
    return state.selected?.startsWith("gate-") ? Number(state.selected.slice(5)) : -1;
  }

  const flightElements = new Map();
  const gatePicker = $("#gate-picker");
  const gateOptions = gates.map(({name}, index) => {
    const label = document.createElement("label");
    label.className = "gate-option";
    label.innerHTML = '<input type="radio" name="arrival-gate">' +
      '<span class="gate-choice"><strong>' + name + '</strong><small></small></span>';
    const input = label.querySelector("input");
    input.value = index;
    input.addEventListener("change", () => select(state.selected, index));
    $("#gate-options").append(label);
    return {input, status: label.querySelector("small")};
  });

  function paintGatePicker(flight, gate) {
    gatePicker.hidden = flight?.stage !== "holding";
    if (gatePicker.hidden) return;
    gateOptions.forEach(({input, status}, index) => {
      const occupant = flightAtGate(index);
      input.disabled = Boolean(occupant);
      input.checked = index === gate;
      status.textContent = !occupant ? "Open"
        : occupant.stage === "reserved" || occupant.stage === "inbound" ? "Reserved" : "Occupied";
    });
  }

  function clockMinutes(seconds) {
    return startMinutes + Math.floor(seconds / secondsPerMinute + 1e-9);
  }

  function formatTime(minutes) {
    return [Math.floor(minutes / 60) % 24, minutes % 60].map(num => String(num).padStart(2, "0")).join(":");
  }

  function paintBoardingTime(container, flight) {
    container.hidden = flight?.stage !== "parked";
    if (container.hidden) return;
    const time = container.querySelector("time");
    time.dateTime = formatTime(clockMinutes(flight.boardingAt));
    time.textContent = time.dateTime;
  }

  function takeoffSchedule(flight) {
    if (!flight) return null;
    if (state.departure?.flight === flight && movementProgress(state.departure) >= liftoff) return null;

    const scheduledMinute = clockMinutes(flight.takeoffAt);
    const remaining = scheduledMinute - clockMinutes(state.now);
    const time = formatTime(scheduledMinute);
    if (remaining < 0) return {time, urgency: "late", message: -remaining + " min late"};
    if (remaining === 0) return {time, urgency: "due", message: "Due now"};
    if (remaining <= takeoffWarningMinutes) return {time, urgency: "due", message: remaining + " min to go"};
    return {time, urgency: "", message: ""};
  }

  function paintTakeoffTime(container, alert, flight, card) {
    const schedule = takeoffSchedule(flight);
    container.hidden = !schedule;
    alert.hidden = !schedule?.message;
    card.dataset.takeoff = schedule?.urgency || "";
    if (!schedule) return;
    const time = container.querySelector("time");
    time.dateTime = schedule.time;
    time.textContent = schedule.time;
    alert.textContent = schedule.message;
  }

  function flightStatus(flight) {
    if (flight.stage === "outbound" && departureOnRunway()) return "Taking off";
    return statusText[flight.stage];
  }

  function paintFlightProgress(button, flight) {
    const {checkIn, security, gate, gateQueue, boarded, boarding, missed, outside} = occupancy.byFlight.get(flight.id);
    button.querySelector(".flight-load b").textContent = boarded + " / " + flight.passengers;
    button.querySelector(".flight-progress-track span").style.width = boarded / flight.passengers * 100 + "%";
    const stages = [[checkIn, "at check-in"], [security, "at security"], [gate + gateQueue, "at gate"],
      [boarding, "walking to aircraft"], [outside, "yet to arrive"], [missed, "empty seats"]];
    button.querySelector(".flight-stages").innerHTML = stages.filter(([count]) => count > 0)
      .map(([count, label]) => '<span><b>' + count + '</b> ' + label + '</span>').join("");
  }

  function paintFlights() {
    const active = new Set(state.flights.map(flight => flight.id));
    for (const [id, button] of flightElements) {
      if (!active.has(id)) {
        button.remove();
        flightElements.delete(id);
      }
    }
    for (const flight of state.flights) {
      let button = flightElements.get(flight.id);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "flight";
        button.style.setProperty("--livery", airlines[flight.airline].ui);
        button.innerHTML = '<span class="airline-mark">' + planeIcon + '</span>' +
          '<span class="flight-name"><strong></strong><small></small>' +
          '<span class="flight-takeoff" hidden>Takeoff <time></time></span></span>' +
          '<span class="flight-state">' +
          '<span class="flight-status"></span>' +
          '<span class="flight-boarding" hidden><span class="boarding-label"></span><time></time></span>' +
          '<span class="takeoff-alert" hidden></span></span>' +
          '<span class="flight-progress"><span class="flight-load"><span><b></b> boarded</span>' +
          '<span class="flight-progress-track" aria-hidden="true"><span></span></span></span>' +
          '<span class="flight-stages"></span></span>';
        button.addEventListener("click", () => {
          select(flight.id);
          if (mobileLayout.matches) revealFlight();
        });
        $("#flight-list").append(button);
        flightElements.set(flight.id, button);
      }
      button.setAttribute("aria-pressed", String(flight.id === state.selected));
      const arriving = isArriving(flight);
      const gate = gates[flight.gate];
      button.querySelector("strong").textContent = arriving ? "To " + flight.destination : flight.destination;
      button.querySelector("small").textContent = flight.id + " · " + (gate?.name || "Next flight");
      const badge = button.querySelector(".flight-status");
      const boarding = button.querySelector(".flight-boarding");
      paintBoardingTime(boarding, flight);
      paintTakeoffTime(button.querySelector(".flight-takeoff"), button.querySelector(".takeoff-alert"), flight, button);
      badge.hidden = !boarding.hidden;
      badge.dataset.stage = flight.stage;
      badge.textContent = flightStatus(flight);
      paintFlightProgress(button, flight);
      if (!boarding.hidden) {
        boarding.querySelector(".boarding-label").textContent = state.now >= flight.boardingAt
          ? "Boarding due" : "Boarding time";
      }
    }
    if (!state.flights.length) {
      if (!$("#empty-board")) {
        const message = document.createElement("p");
        message.className = "detail-copy";
        message.id = "empty-board";
        message.textContent = "Waiting for the next arrival.";
        $("#flight-list").append(message);
      }
    } else {
      $("#empty-board")?.remove();
    }
    const occupied = gates.filter((_, index) => flightAtGate(index)).length;
    $("#gate-count").textContent = occupied + " / " + gates.length + " gates in use";
  }

  function progress(label, value, percentage) {
    return stat(label, value) + '<div class="detail-bar"><div style="width:' + percentage + '%"></div></div>';
  }

  function stat(label, value) {
    return '<div class="detail-stat"><span>' + label + '</span><b>' + value + '</b></div>';
  }

  function paintDetail() {
    const flight = state.flights.find(item => item.id === state.selected);
    const gate = selectedGate();
    const panel = $("#flight-detail");
    const action = $("#flight-action");
    const close = $("#close-boarding");
    const upgrade = $("#flight-upgrade");
    const takeoff = $("#detail-takeoff");
    paintTakeoffTime(takeoff, takeoff.querySelector(".takeoff-alert"), flight, takeoff);
    paintBoardingTime($("#detail-boarding"), flight);
    paintGatePicker(flight, gate);
    close.hidden = upgrade.hidden = true;
    panel.hidden = !flight && gate < 0;
    if (panel.hidden) return;
    action.hidden = !flight || flight.stage === "boarding";
    if (!flight) {
      $("#detail-kicker").textContent = "Gate " + gates[gate].name;
      $("#detail-title").textContent = "Stand available";
      $("#detail-content").innerHTML = '<p class="detail-copy">This gate can receive the next arrival.</p>';
      return;
    }
    const {stage, passengers, id, destination} = flight;
    const counts = occupancy.byFlight.get(id);
    const arriving = isArriving(flight);
    $("#detail-kicker").textContent = (arriving ? "Next flight" : gates[flight.gate].name) + " / " + id;
    $("#detail-title").textContent = arriving ? "To " + destination : destination;
    if (stage === "holding") {
      $("#detail-content").innerHTML = '<p class="detail-copy">Aircraft holding for a gate.</p>';
    } else if (stage === "reserved") {
      $("#detail-content").innerHTML = '<p class="detail-copy">Gate ' + gates[flight.gate].name +
        ' is reserved. Taxi-in starts when the departing aircraft reaches the runway.</p>';
    } else if (stage === "inbound") {
      $("#detail-content").innerHTML = '<p class="detail-copy">Taxiing to gate ' + gates[flight.gate].name + '.</p>';
    } else if (stage === "outbound") {
      $("#detail-content").innerHTML = departureOnRunway()
        ? '<p class="detail-copy">Taking off from runway 09.</p>'
        : '<p class="detail-copy">Aircraft cleared for runway 09.</p>';
    } else {
      const {outside, boarded, boarding, gateQueue, gate: lounge, missed, checkIn, security} = counts;
      const elsewhere = passengers - outside - missed - boarded - lounge - gateQueue - boarding - checkIn - security;
      $("#detail-content").innerHTML = progress("Passengers boarded", boarded + " / " + passengers, boarded / passengers * 100) +
        '<div class="flow-stats">' + (checkIn ? stat("At check-in", checkIn) : "") +
        (security ? stat("At security", security) : "") + stat("In lounge", lounge) +
        stat("In boarding line", gateQueue) + stat("Walking to aircraft", boarding) +
        (elsewhere ? stat("Elsewhere in terminal", elsewhere) : "") +
        (outside ? stat("Yet to arrive", outside) : "") + (missed ? stat("Empty seats", missed) : "") + '</div>';
    }
    if (arriving) {
      $("#detail-content").insertAdjacentHTML("beforeend", '<div class="flow-stats">' +
        stat("Passengers in terminal", (passengers - counts.outside) + " / " + passengers) + '</div>');
    }
    const departureBlocked = Boolean(state.departure || state.taxiIn);
    const waiting = passengers - counts.boarded - counts.boarding - counts.missed;
    const labels = {
      parked: "Start boarding",
      closing: "Finishing boarding",
      ready: departureBlocked ? "Airfield in use" : "Clear for departure",
      holding: gate >= 0 ? "Assign gate " + gates[gate].name
        : availableGate() >= 0 ? "Choose an open gate" : "No open gates",
      reserved: "Waiting for taxi clearance",
      inbound: "Taxiing to gate", outbound: "Departure in progress"
    };
    action.textContent = labels[stage] ?? "";
    action.disabled = stage !== "parked" && !(stage === "ready" && !departureBlocked) &&
      !(stage === "holding" && gate >= 0);
    close.hidden = stage !== "boarding" || waiting === 0;
    if (!close.hidden) close.textContent = "Close boarding · " + waiting + (waiting === 1 ? " empty seat" : " empty seats");
    upgrade.hidden = counts.security === 0 || state.lanes === 3;
    upgrade.disabled = state.cash < laneCost;
  }

  function paint() {
    if (occupancyDirty) {
      occupancy = passengerFlow.snapshot(state.flights, flow);
      occupancyDirty = false;
      requestDraw = true;
    }
    const minutes = clockMinutes(state.now);
    const time = formatTime(minutes);
    const satisfaction = Math.min(100, Math.max(55, 84 + state.dispatched * 2 + (state.lanes - 2) * 4 -
      Math.floor((occupancy.security.length - 38) / 16) - Math.ceil(state.missedPassengers / 5) - Math.floor(state.delayMinutes / 5)));
    $("#cash").textContent = currency.format(state.cash);
    $("#passengers").textContent = occupancy.total;
    $("#satisfaction").textContent = satisfaction + "%";
    $(".clock-day").textContent = "DAY " + String(1 + Math.floor(minutes / 1440)).padStart(2, "0");
    $("#clock").textContent = time;
    $("#clock").setAttribute("datetime", time);
    $("#run-label").textContent = state.paused ? "Paused" : "Running";
    $("#run-label").classList.toggle("paused", state.paused);
    $("#pause-icon").setAttribute("href", state.paused ? "#play" : "#pause");
    $("#pause-toggle").setAttribute("aria-label", state.paused ? "Resume simulation" : "Pause simulation");
    document.querySelectorAll("[data-speed]").forEach(button => button.setAttribute("aria-pressed", String(!state.paused && state.speed === Number(button.dataset.speed))));
    const terminalOpen = state.view === "terminal";
    $("#terminal-tab").setAttribute("aria-pressed", String(terminalOpen));
    $("#flights-tab").setAttribute("aria-pressed", String(!terminalOpen));
    $("#terminal-view").hidden = !terminalOpen;
    $("#flight-view").hidden = terminalOpen;
    paintFlights();
    paintDetail();
    if (terminalOpen) {
      $("#check-in-count").textContent = occupancy.checkIn.length;
      $("#landside-count").textContent = occupancy.landside.length;
      $("#security-count").textContent = occupancy.security.length;
      $("#concourse-count").textContent = occupancy.concourse.length;
      $("#shared-seats-count").textContent = occupancy.sharedSeats.length;
      $("#cafe-count").textContent = occupancy.cafe.length;
      $("#boarding-count").textContent = occupancy.boarding.length;
      $("#exiting-count").textContent = occupancy.exiting.length;
      $("#lanes-count").textContent = state.lanes + " / 3";
      $("#lounge-counts").querySelectorAll("b").forEach((count, index) => {
        count.textContent = occupancy.gates[index].length;
      });
      const upgrade = $("#upgrade");
      upgrade.disabled = state.lanes === 3 || state.cash < laneCost;
      upgrade.innerHTML = state.lanes === 3 ? "All lanes open" : "Open a lane <span>" + currency.format(laneCost) + "</span>";
    }
    const goal = Math.min(state.dispatched, 2);
    $("#goal-bar").style.width = goal * 50 + "%";
    $("#goal-count").textContent = goal + " / 2";
    $("#objective-title").textContent = goal === 2 ? "Shift objective complete" : "Dispatch 2 aircraft";

    const gate = selectedGate();
    mapPins.forEach(({element, count}, index) => {
      const flight = flightAtGate(index);
      const waiting = occupancy.gates[index].length;
      count.textContent = waiting;
      element.dataset.state = flight?.stage || "free";
      element.setAttribute("aria-pressed", String(gate === index));
      element.setAttribute("aria-label", "Gate " + gates[index].name + ", " +
        (flight ? flightStatus(flight) : "available") + ", " + waiting + " waiting");
    });
    const holding = flightAtHoldingPoint();
    if (holding) {
      const route = holding.id + " to " + holding.destination;
      const {time} = takeoffSchedule(holding);
      holdingPinRoute.textContent = route;
      holdingPinTime.dateTime = time;
      holdingPinTime.textContent = time;
      holdingPin.setAttribute("aria-pressed", String(holding.id === state.selected));
      holdingPin.setAttribute("aria-label", statusText[holding.stage] + ". Next flight " + route + ". Takeoff at " + time);
    }
    for (const {count, section} of mapSigns) {
      if (count) count.textContent = occupancy[section].length;
    }
  }

  function departurePath(gate) {
    const {x} = gates[gate];
    const halfTurn = Math.PI / 2;
    return [
      [0, x, -4.75, 0], [.17, x, -15, 0], [pushbackEnd, x - 2.1, -22, -halfTurn],
      [.39, -39.7, taxiwayZ, -halfTurn], [.445, -45, taxiwayZ - 2.3, -2.3],
      [.545, -45, runwayZ + 3.8, Math.PI], [runwayEntry, -40.4, runwayZ, halfTurn],
      [.735, -17.4, runwayZ, halfTurn], [.82, 12, runwayZ, halfTurn],
      [liftoff, 42, runwayZ, halfTurn], [1, 86, runwayZ, halfTurn, 16, .23]
    ];
  }

  function aircraftPosition(flight) {
    if (flight.stage === "holding" || flight.stage === "reserved") return holdingPosition;
    const movement = flight.stage === "inbound" ? state.taxiIn : state.departure;
    if (movement?.flight !== flight) return {x: gates[flight.gate].x, z: -4.75};
    const {path} = movement;
    const fraction = movementProgress(movement);
    const end = path.findIndex((point, i) => i > 0 && point[0] >= fraction);
    const a = path[end - 1], b = path[end];
    const t = (fraction - a[0]) / (b[0] - a[0]);
    const mix = index => (a[index] || 0) + ((b[index] || 0) - (a[index] || 0)) * t;
    const arc = Math.atan2(Math.sin(b[3] - a[3]), Math.cos(b[3] - a[3]));
    return {x: mix(1), z: mix(2), angle: a[3] + arc * t, y: mix(4), pitch: mix(5)};
  }

  function startTaxiIn(flight) {
    const {x, name} = gates[flight.gate];
    const route = [
      [holdingPosition.x, holdingPosition.z, holdingPosition.angle],
      [x + 6, taxiwayZ, holdingPosition.angle], [x + 1.8, -21.2, -.77],
      [x, -17, 0], [x, -4.75, 0]
    ];
    let distance = 0;
    const waypoints = route.map(([x, z, angle], index) => {
      if (index > 0) {
        const [previousX, previousZ] = route[index - 1];
        distance += Math.hypot(x - previousX, z - previousZ);
      }
      return [distance, x, z, angle];
    });
    const path = waypoints.map(([travelled, x, z, angle]) => [travelled / distance, x, z, angle]);
    flight.stage = "inbound";
    state.taxiIn = {flight, start: state.now, duration: distance / inboundTaxiSpeed, path};
    announce(flight.id + " taxiing to " + name + ".");
  }

  function command() {
    const flight = state.flights.find(item => item.id === state.selected);
    if (!flight || $("#flight-action").disabled) return;
    if (flight.stage === "parked") {
      flight.stage = "boarding";
      announce("Boarding started at " + gates[flight.gate].name + ".");
    } else if (flight.stage === "ready") {
      flight.stage = "outbound";
      state.departure = {flight, start: state.now, duration: 24, path: departurePath(flight.gate)};
      announce(flight.id + " cleared for departure.");
    } else if (flight.stage === "holding") {
      const gate = selectedGate();
      if (gate < 0) return;
      flight.gate = gate;
      if (taxiwayBusy()) {
        flight.stage = "reserved";
        announce(gates[gate].name + " reserved for " + flight.id + ".");
      } else {
        startTaxiIn(flight);
      }
    }
    paint();
  }

  function closeSelectedBoarding() {
    const flight = state.flights.find(item => item.id === state.selected);
    if (flight?.stage !== "boarding" || $("#close-boarding").hidden) return;
    const missed = passengerFlow.closeBoarding(flight, flow);
    state.missedPassengers += missed;
    flight.stage = flight.manifest.some(person => person.zone === "boarding") ? "closing" : "ready";
    occupancyDirty = true;
    announce(flight.id + " boarding closed. " + missed + " missed the flight.");
    paint();
  }

  function update(dt) {
    if (state.paused) return;
    const simDelta = dt * state.speed;
    state.now += simDelta;
    const changed = passengerFlow.advance(state.flights, flow, state.now, simDelta, state.lanes,
      flight => {
        flight.stage = "ready";
        announce(flight.id + " is ready for departure.");
      });
    occupancyDirty ||= changed;
    if (state.taxiIn && movementProgress(state.taxiIn) === 1) {
      const {flight} = state.taxiIn;
      state.taxiIn = null;
      occupancyDirty = true;
      flight.stage = "parked";
      announce(flight.id + " parked at " + gates[flight.gate].name + ".");
      state.nextArrival = state.now + 18;
    }
    if (state.departure && movementProgress(state.departure) === 1) {
      const {flight, start, duration} = state.departure;
      state.departure = null;
      occupancyDirty = true;
      const boarded = flight.manifest.filter(person => person.zone === "boarded").length;
      const income = 3800 + boarded * passengerFare;
      const liftoffMinute = clockMinutes(start + duration * liftoff);
      state.delayMinutes += Math.max(0, liftoffMinute - clockMinutes(flight.takeoffAt));
      const completed = ++state.dispatched === 2;
      state.cash += income + (completed ? 10000 : 0);
      state.flights = state.flights.filter(item => item !== flight);
      if (state.selected === flight.id) state.selected = state.flights[0]?.id || "gate-" + flight.gate;
      announce(completed ? "Shift complete. $10,000 bonus earned." : flight.id + " airborne with " + boarded +
        " passengers. " + currency.format(income) + " earned.");
    }
    if (!taxiwayBusy()) {
      const waiting = state.flights.find(item => item.stage === "reserved");
      if (waiting) startTaxiIn(waiting);
    }
    if (state.now > state.nextArrival && !state.flights.some(isArriving)) {
      let route, airline;
      do {
        route = state.nextRoute % routes.length;
        airline = state.nextRoute++ % airlines.length;
      } while (state.flights.some(flight => flight.destination === routes[route][0]));
      const flight = makeArrival(route, airline, state.now);
      state.flights.push(flight);
      occupancyDirty = true;
      announce(flight.id + " holding short for a gate assignment.");
    }
  }

  const aircraftSelection = $("#aircraft-selection");
  function showAircraftSelection(aircraft) {
    if (!aircraft) {
      aircraftSelection.hidden = true;
      return;
    }
    const {left, top, right, bottom} = renderer.projectBounds(aircraft);
    aircraftSelection.hidden = right <= 0 || bottom <= 0 ||
      left >= renderer.view.width || top >= renderer.view.height;
    if (aircraftSelection.hidden) return;
    const padding = 6;
    aircraftSelection.style.left = (left - padding) + "px";
    aircraftSelection.style.top = (top - padding) + "px";
    aircraftSelection.style.width = (right - left + padding * 2) + "px";
    aircraftSelection.style.height = (bottom - top + padding * 2) + "px";
  }

  function draw() {
    if (!renderer || (mobileLayout.matches && game.dataset.mobileView === "operations")) return;
    const moving = state.flights.map(flight => ({
      mesh: planes[flight.airline], ...aircraftPosition(flight), flightId: flight.id
    }));
    const selectedAircraft = moving.find(object => object.flightId === state.selected);
    const carTravel = state.now * 2.4;
    for (const vehicle of scene.traffic) {
      const direction = Math.sign(vehicle.angle);
      const x = ((vehicle.offset + carTravel) % 110 - 55) * direction;
      moving.push({...vehicle, x});
    }
    const people = airport.passengerActors(scene.outfits, occupancy);
    for (const {person, flight} of occupancy.security) {
      if (flight.id !== state.selected) continue;
      const [x, y, z] = person.position;
      moving.push({mesh: scene.securityHighlight, x, y, z, castShadow: false});
    }
    if (state.lanes === 2) moving.push({mesh: laneClosed});
    const gate = gates[selectedGate()];
    if (gate) moving.push({mesh: scene.highlight, x: gate.x, castShadow: false});
    renderer.render([...scene.fixed, ...moving, ...people]);
    showAircraftSelection(selectedAircraft);
    for (const {x, y, z, element} of [...mapPins, ...mapSigns, holdingPinPosition]) {
      const [left, top] = renderer.project(x, y, z);
      element.style.left = left + "px";
      element.style.top = top + "px";
      element.hidden = left < 18 || top < 19 || left > renderer.view.width - 18 || top > renderer.view.height - 18 ||
        (element.className === "map-note" && renderer.view.width < 520) ||
        (element === holdingPin && (!flightAtHoldingPoint() || left < 90 || left > renderer.view.width - 90));
    }
  }

  function togglePause() {
    state.paused = !state.paused;
    paint();
  }

  $("#flights-tab").addEventListener("click", () => notifyTab("flights"));
  $("#terminal-tab").addEventListener("click", () => notifyTab("terminal"));
  $("#show-map").addEventListener("click", () => showMobileView("map"));
  $("#show-operations").addEventListener("click", () => showMobileView("operations"));
  $("#flight-action").addEventListener("click", command);
  $("#close-boarding").addEventListener("click", closeSelectedBoarding);
  $("#pause-toggle").addEventListener("click", togglePause);
  function openLane() {
    if (state.lanes !== 2 || state.cash < laneCost) return;
    state.lanes++;
    state.cash -= laneCost;
    announce("Security lane 3 is now open.");
    paint();
  }
  $("#upgrade").addEventListener("click", openLane);
  const flightUpgrade = $("#flight-upgrade");
  flightUpgrade.innerHTML = "Open security lane 3 <span>" + currency.format(laneCost) + "</span>";
  flightUpgrade.addEventListener("click", openLane);
  document.querySelectorAll("[data-speed]").forEach(button => {
    button.addEventListener("click", () => {
      state.speed = Number(button.dataset.speed);
      state.paused = false;
      paint();
    });
  });
  function zoom(factor, anchor) {
    if (!renderer) return;
    const {view} = renderer;
    const next = Math.max(.65, Math.min(2.7, view.zoom * factor));
    const [x, y] = anchor ?? [view.width / 2, view.height / 2];
    const multiplier = next / view.zoom - 1;
    view.x += (view.width * .495 + view.x - x) * multiplier;
    view.y += (view.height * .51 + view.y - y) * multiplier;
    view.zoom = next;
    requestDraw = true;
  }
  function fit() {
    if (renderer) Object.assign(renderer.view, {zoom: 1, x: 0, y: 0});
    requestDraw = true;
  }
  $("#zoom-in").addEventListener("click", () => zoom(1.22));
  $("#zoom-out").addEventListener("click", () => zoom(1 / 1.22));
  $("#reset-view").addEventListener("click", fit);
  const canvas = $("#scene");
  if (renderer) {
    const pointers = new Map();
    const dragThreshold = 6;
    const touchOffsets = [[8, 0], [-8, 0], [0, 8], [0, -8]];
    let tapOrigin = null;

    function mapPoint(event) {
      const rect = canvas.getBoundingClientRect();
      return {x: event.clientX - rect.left, y: event.clientY - rect.top};
    }

    function aircraftAt({x, y}, touch) {
      const hit = renderer.pickAircraft(x, y);
      if (hit || !touch) return hit;
      for (const [dx, dy] of touchOffsets) {
        const nearby = renderer.pickAircraft(x + dx, y + dy);
        if (nearby) return nearby;
      }
      return null;
    }

    function pan(dx, dy) {
      const {view} = renderer;
      view.x = Math.max(-view.width * 1.5, Math.min(view.width * 1.5, view.x + dx));
      view.y = Math.max(-view.height * 1.5, Math.min(view.height * 1.5, view.y + dy));
      requestDraw = true;
    }

    canvas.addEventListener("wheel", event => {
      event.preventDefault();
      const {x, y} = mapPoint(event);
      zoom(Math.exp(-Math.max(-72, Math.min(72, event.deltaY)) * .003), [x, y]);
    }, {passive: false});
    canvas.addEventListener("pointerdown", event => {
      const touch = event.pointerType === "touch";
      if (event.button !== 0 || pointers.size >= 2 ||
        (pointers.size && (!touch || !pointers.values().next().value.touch))) return;
      const point = {...mapPoint(event), touch};
      pointers.set(event.pointerId, point);
      tapOrigin = pointers.size === 1 ? {...point, flightId: touch ? null : aircraftAt(point, false)} : null;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", event => {
      const point = pointers.get(event.pointerId);
      const next = mapPoint(event);
      if (!point) {
        if (!pointers.size && event.pointerType === "mouse") {
          canvas.toggleAttribute("data-aircraft-hover", Boolean(aircraftAt(next, false)));
        }
        return;
      }
      const dx = next.x - point.x, dy = next.y - point.y;
      if (pointers.size === 2) {
        const [first, second] = pointers.values();
        const other = point === first ? second : first;
        const distance = Math.hypot(point.x - other.x, point.y - other.y);
        const nextDistance = Math.hypot(next.x - other.x, next.y - other.y);
        if (distance > 0 && nextDistance > 0) {
          zoom(nextDistance / distance, [(point.x + other.x) / 2, (point.y + other.y) / 2]);
        }
        pan(dx / 2, dy / 2);
      } else {
        if (tapOrigin && Math.hypot(dx, dy) < dragThreshold) return;
        tapOrigin = null;
        pan(dx, dy);
      }
      Object.assign(point, next);
    });
    canvas.addEventListener("pointerup", event => {
      if (!pointers.delete(event.pointerId)) return;
      const origin = tapOrigin;
      tapOrigin = null;
      if (!origin) return;
      const point = mapPoint(event);
      if (Math.hypot(point.x - origin.x, point.y - origin.y) >= dragThreshold) return;
      const flightId = origin.touch ? aircraftAt(point, true) : origin.flightId;
      if (state.flights.some(flight => flight.id === flightId)) selectFromMap(flightId);
    });
    function cancelPointer(event) {
      if (pointers.delete(event.pointerId)) tapOrigin = null;
    }
    canvas.addEventListener("pointercancel", cancelPointer);
    canvas.addEventListener("lostpointercapture", cancelPointer);
    canvas.addEventListener("pointerleave", () => canvas.removeAttribute("data-aircraft-hover"));
  }
  window.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (event.code === "Space" && !["BUTTON", "INPUT", "TEXTAREA"].includes(event.target.tagName)) {
      event.preventDefault();
      togglePause();
    }
    if (event.key === "+" || event.key === "=") zoom(1.22);
    if (event.key === "-") zoom(1 / 1.22);
    if (event.key === "0") fit();
  });
  let requestDraw = true;
  let lastFrame = performance.now(), lastPaint = 0, lastDraw = 0;
  window.addEventListener("resize", () => { requestDraw = true; });
  function frame(timestamp) {
    update(Math.max(0, Math.min(.15, (timestamp - lastFrame) / 1000)));
    lastFrame = timestamp;
    const drawDue = requestDraw || (!state.paused && timestamp - lastDraw >= 32);
    if ((drawDue || !renderer) && (occupancyDirty || (!state.paused && timestamp - lastPaint > 160))) {
      paint();
      lastPaint = timestamp;
    }
    if (drawDue) {
      draw();
      lastDraw = timestamp;
      requestDraw = false;
    }
    requestAnimationFrame(frame);
  }
  // Updating the scene once on paused commands keeps gate highlights and the checkpoint in sync.
  document.addEventListener("click", () => { requestDraw = true; });
  paint();
  requestAnimationFrame(frame);
})();

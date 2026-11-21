"use strict";

(() => {
  const $ = selector => document.querySelector(selector);
  const {gates, runwayZ, taxiwayZ, floor} = airport;
  const mobileLayout = window.matchMedia("(max-width: 760px), (pointer: coarse) and (max-height: 500px)");
  const game = $(".game");
  const currency = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", maximumFractionDigits: 0});
  const startingCash = 124500;
  const laneCost = 12500;
  const handlingCost = 2000;
  const passengerFare = 41;
  const startMinutes = 8 * 60 + 42;
  const secondsPerMinute = 3.4;
  const minutesFromBoardingToTakeoff = 30;
  const earliestPassengerArrival = 70;
  const latestPassengerArrival = 40;
  const takeoffWarningMinutes = 10;
  const taxiSpeed = 4;
  const pushbackSpeed = 2.5;
  const holdingPosition = {x: 44, z: taxiwayZ, angle: -Math.PI / 2};
  const planeIcon = '<svg class="icon" aria-hidden="true"><use href="#plane"/></svg>';
  const airlines = [
    {code: "PL", symbol: "#197f79", ui: "#8fd8ca"},
    {code: "SA", symbol: "#bd6d43", ui: "#efb08b"},
    {code: "PA", symbol: "#5674a7", ui: "#a4bfe9"},
    {code: "NR", symbol: "#8b698c", ui: "#d3a9d3"}
  ];
  const routes = [
    ["Melbourne", 96], ["Brisbane", 90], ["Auckland", 110],
    ["Hobart", 86], ["Adelaide", 102], ["Wellington", 94]
  ];
  // Arrival and takeoff times are minutes after the shift opens at 08:42.
  const timetable = [
    [0, 0, 214, null, 13], [1, 1, 507, null, 46], [2, 2, 318, 0, 70],
    [3, 3, 126, 20, 84], [4, 0, 435, 25, 97],
    [5, 1, 201, 115, 171], [0, 2, 216, 124, 184], [1, 3, 509, 135, 196], [2, 0, 320, 150, 215],
    [3, 1, 128, 255, 311], [4, 2, 437, 260, 323], [5, 3, 203, 270, 339],
    [0, 0, 218, 410, 465], [1, 1, 511, 423, 482], [2, 2, 322, 480, 550], [3, 3, 130, 580, 644]
  ].map(([route, airline, number, arrivalMinute, takeoffMinute]) => {
    const [destination, passengers] = routes[route];
    const arrivalAt = arrivalMinute === null ? null : arrivalMinute * secondsPerMinute;
    const boardingAt = Math.max(0, takeoffMinute - minutesFromBoardingToTakeoff) * secondsPerMinute;
    const takeoffAt = takeoffMinute * secondsPerMinute;
    return {id: airlines[airline].code + number, destination, airline, passengers, arrivalAt, boardingAt, takeoffAt};
  });

  function makeFlight(plan, index) {
    const {arrivalAt, takeoffAt, passengers} = plan;
    const gate = arrivalAt === null ? index : null;
    const stage = arrivalAt === null ? (gate === 0 ? "boarding" : "parked")
      : arrivalAt === 0 ? "holding" : "scheduled";
    const initialPassengers = gate === 0 ? {boarded: 68, gateQueue: 8, gate: 20}
      : gate === 1 ? {gate: 19, cafe: 5, concourse: 12, security: 38, checkIn: 16} : null;
    const manifest = passengerFlow.manifest(passengers, initialPassengers,
      takeoffAt - earliestPassengerArrival * secondsPerMinute,
      takeoffAt - latestPassengerArrival * secondsPerMinute);
    return {...plan, stage, gate, manifest};
  }

  function createShift() {
    return {cash: startingCash, now: 0, speed: 1, paused: false, lanes: 2, missedPassengers: 0, delayMinutes: 0,
      flights: timetable.map(makeFlight), results: [], selected: "SA507", view: "flights",
      taxiIn: null, taxiQueue: [], departure: null, nextDeparture: null};
  }

  let state = createShift();
  const statusText = {
    scheduled: "Expected",
    parked: "At gate", boarding: "Boarding", closing: "Boarding closed", ready: "Ready", holding: "Holding",
    reserved: "Gate reserved", inbound: "Taxiing in", outbound: "Departing"
  };
  let flow = passengerFlow.create(state.flights, state.lanes);
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
      const arrivals = state.flights.filter(item => item.stage === "holding");
      const arrival = arrivals.find(item => item.id === state.selected) || arrivals[0];
      selectFromMap(flight?.id || arrival?.id || "gate-" + gate, gate);
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
  const holdingPinCount = holdingPin.querySelector(".holding-count");
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
    if (state.view !== view) $(".panel-body").scrollTop = 0;
    state.view = view;
    paint();
  }

  function flightAtGate(gate) {
    const departure = state.departure;
    const pushedBack = departure && movementElapsed(departure) >= departure.pushbackEnd ? departure.flight : null;
    return state.flights.find(flight => flight.gate === gate && flight !== pushedBack);
  }

  function isArriving({stage}) {
    return stage === "scheduled" || stage === "holding" || stage === "reserved" || stage === "inbound";
  }

  function holdingFlights() {
    return state.flights.filter(({stage}) => stage === "holding" || stage === "reserved");
  }

  function flightAtHoldingPoint(waiting = holdingFlights()) {
    if (state.taxiIn && movementElapsed(state.taxiIn) < 4.5) return null;
    return waiting.find(flight => flight.id === state.selected) || waiting[0];
  }

  function movementElapsed({start, duration}) {
    return Math.min(duration, state.now - start);
  }

  function departureOnRunway() {
    const departure = state.departure;
    return departure && movementElapsed(departure) >= departure.runwayEntry;
  }

  function taxiwayBusy() {
    return Boolean(state.taxiIn || (state.departure && !departureOnRunway()));
  }

  function departureBlocked() {
    return Boolean(state.departure || state.taxiIn);
  }

  function shiftComplete() {
    return state.results.length === timetable.length;
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
    const departure = state.departure;
    if (departure?.flight === flight && movementElapsed(departure) >= departure.liftoff) return null;

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
    if (flight === state.nextDeparture) return "Takeoff queued";
    if (flight.stage === "outbound" && departureOnRunway()) return "Taking off";
    return statusText[flight.stage];
  }

  function scheduleTime(seconds) {
    const time = formatTime(clockMinutes(seconds));
    return '<time datetime="' + time + '">' + time + '</time>';
  }

  const scheduleRows = timetable.map(({id, destination, arrivalAt, boardingAt, takeoffAt}) => {
    const row = document.createElement("tr");
    const arrival = arrivalAt === null ? '<span class="schedule-initial">At gate</span>' : scheduleTime(arrivalAt);
    row.innerHTML = '<th scope="row"><button type="button" class="schedule-flight">' + destination +
      '</button><span class="schedule-destination" hidden>' + destination + '</span><span class="schedule-id">' +
      id + '<span class="schedule-gate"></span></span></th><td>' + arrival + '</td><td>' + scheduleTime(boardingAt) +
      '</td><td>' + scheduleTime(takeoffAt) + '<span class="schedule-status"></span></td>';
    const button = row.querySelector("button");
    button.setAttribute("aria-label", "Open " + destination + " " + id + " on flight board");
    button.addEventListener("click", () => {
      const flight = state.flights.find(item => item.id === id);
      if (!flight) return;
      if (flight.stage === "scheduled") $("#upcoming").open = true;
      select(id);
      revealFlight();
    });
    $("#schedule-rows").append(row);
    return {id, row, button, destinationLabel: row.querySelector(".schedule-destination"),
      gateLabel: row.querySelector(".schedule-gate"), status: row.querySelector(".schedule-status")};
  });
  $("#schedule-hours").textContent = formatTime(startMinutes) + "–" + formatTime(clockMinutes(timetable.at(-1).takeoffAt));

  function paintSchedule() {
    const active = new Map(state.flights.map(flight => [flight.id, flight]));
    const departed = new Map(state.results.map(result => [result.id, result]));
    for (const {id, row, button, destinationLabel, gateLabel, status} of scheduleRows) {
      const flight = active.get(id);
      const result = departed.get(id);
      const gate = flight && gates[flight.gate];
      button.hidden = !flight;
      destinationLabel.hidden = Boolean(flight);
      gateLabel.textContent = gate ? " · " + gate.name : "";
      row.dataset.stage = flight?.stage ?? "departed";
      row.dataset.late = result && result.takeoff > result.due ? "true" : "false";
      status.textContent = result ? "Left " + formatTime(result.takeoff) : flightStatus(flight);
      status.hidden = flight?.stage === "scheduled";
    }
  }

  function paintFlightProgress(button, flight) {
    const {checkIn, security, gate, gateQueue, boarded, boarding, missed, outside} = occupancy.byFlight.get(flight.id);
    button.querySelector(".flight-progress").hidden = flight.stage === "scheduled" && outside === flight.passengers;
    button.querySelector(".flight-load b").textContent = boarded + " / " + flight.passengers;
    button.querySelector(".flight-progress-track span").style.width = boarded / flight.passengers * 100 + "%";
    const stages = [[checkIn, "at check-in"], [security, "at security"], [gate + gateQueue, "at gate"],
      [boarding, "walking to aircraft"], [outside, "yet to arrive"], [missed, "empty seats"]];
    button.querySelector(".flight-stages").innerHTML = stages.filter(([count]) => count > 0)
      .map(([count, label]) => '<span><b>' + count + '</b> ' + label + '</span>').join("");
  }

  function paintFlights() {
    const flightList = $("#flight-list");
    const upcomingList = $("#upcoming-list");
    const upcoming = state.flights.filter(flight => flight.stage === "scheduled");
    $("#upcoming").hidden = upcoming.length === 0;
    $("#upcoming-count").textContent = upcoming.length;
    $("#upcoming-next").textContent = upcoming.length ? "Next at " + formatTime(clockMinutes(upcoming[0].arrivalAt)) : "";
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
          '<span class="flight-arrival" hidden>Aircraft due <time></time></span>' +
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
        flightElements.set(flight.id, button);
      }
      const expected = flight.stage === "scheduled";
      const list = expected ? upcomingList : flightList;
      if (button.parentNode !== list) list.append(button);
      button.setAttribute("aria-pressed", String(flight.id === state.selected));
      const arriving = isArriving(flight);
      const gate = gates[flight.gate];
      button.querySelector("strong").textContent = arriving ? "To " + flight.destination : flight.destination;
      button.querySelector("small").textContent = gate ? flight.id + " · " + gate.name : flight.id;
      paintArrivalTime(button.querySelector(".flight-arrival"), flight);
      const badge = button.querySelector(".flight-status");
      const boarding = button.querySelector(".flight-boarding");
      paintBoardingTime(boarding, flight);
      paintTakeoffTime(button.querySelector(".flight-takeoff"), button.querySelector(".takeoff-alert"), flight, button);
      badge.hidden = !boarding.hidden;
      badge.dataset.stage = flight === state.nextDeparture ? "queued" : flight.stage;
      badge.textContent = flightStatus(flight);
      paintFlightProgress(button, flight);
      if (!boarding.hidden) {
        boarding.querySelector(".boarding-label").textContent = state.now >= flight.boardingAt
          ? "Boarding due" : "Boarding time";
      }
    }
    $("#flight-view").querySelector(".empty-board").hidden = shiftComplete() || upcoming.length !== state.flights.length;
    const occupied = gates.filter((_, index) => flightAtGate(index)).length;
    $("#gate-count").textContent = occupied + " / " + gates.length + " gates in use";
    const {departure, taxiIn, nextDeparture} = state;
    $("#airfield-label").textContent = !departureOnRunway() && (departure || taxiIn) ? "Taxiway" : "Runway 09 / 27";
    $("#airfield-status").textContent = departure ? departure.flight.id + (departureOnRunway() ? " taking off" : " taxiing out")
      : taxiIn ? taxiIn.flight.id + " taxiing in" : "Available";
    $("#next-slot").textContent = nextDeparture?.id ?? "Open";
    $("#next-slot").classList.toggle("reserved-slot", Boolean(nextDeparture));
  }

  function paintArrivalTime(container, flight) {
    container.hidden = flight?.stage !== "scheduled";
    if (!container.hidden) {
      const time = container.querySelector("time");
      time.dateTime = formatTime(clockMinutes(flight.arrivalAt));
      time.textContent = time.dateTime;
    }
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
    const card = flight && flightElements.get(flight.id);
    if (card && card.nextElementSibling !== panel) card.after(panel);
    if (!card && panel.parentNode !== $("#flight-view")) $("#flight-view").append(panel);
    paintTakeoffTime(takeoff, takeoff.querySelector(".takeoff-alert"), flight, takeoff);
    paintArrivalTime($("#detail-arrival"), flight);
    paintBoardingTime($("#detail-boarding"), flight);
    paintGatePicker(flight, gate);
    close.hidden = upgrade.hidden = true;
    panel.hidden = !flight && gate < 0;
    if (panel.hidden) return;
    action.hidden = !flight || flight.stage === "boarding" || flight.stage === "scheduled";
    if (!flight) {
      $("#detail-kicker").textContent = "Gate " + gates[gate].name;
      $("#detail-title").textContent = "Stand available";
      $("#detail-content").innerHTML = '<p class="detail-copy">This gate can receive the next arrival.</p>';
      return;
    }
    const {stage, passengers, id, destination} = flight;
    const counts = occupancy.byFlight.get(id);
    const arriving = isArriving(flight);
    $("#detail-kicker").textContent = arriving ? id : gates[flight.gate].name + " / " + id;
    $("#detail-title").textContent = arriving ? "To " + destination : destination;
    if (stage === "scheduled" || stage === "holding") {
      $("#detail-content").innerHTML = stage === "holding" ? '<p class="detail-copy">Aircraft holding for a gate.</p>' : "";
    } else if (stage === "reserved") {
      $("#detail-content").innerHTML = '<p class="detail-copy">Gate ' + gates[flight.gate].name +
        ' is reserved. Taxi-in starts when the taxiway clears.</p>';
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
    const waiting = passengers - counts.boarded - counts.boarding - counts.missed;
    const nextDeparture = state.nextDeparture;
    const readyAction = flight === nextDeparture ? "Release next takeoff slot"
      : departureBlocked() ? (nextDeparture ? "Take " + nextDeparture.id + "’s runway slot" : "Reserve next takeoff slot")
      : "Clear for departure";
    const labels = {
      parked: "Start boarding",
      closing: "Finishing boarding",
      ready: readyAction,
      holding: gate >= 0 ? "Assign gate " + gates[gate].name
        : availableGate() >= 0 ? "Choose an open gate" : "No open gates",
      reserved: "Waiting for taxi clearance",
      inbound: "Taxiing to gate", outbound: "Departure in progress"
    };
    action.textContent = labels[stage] ?? "";
    action.disabled = stage !== "parked" && stage !== "ready" &&
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
    const dispatched = state.results.length;
    const satisfaction = Math.min(100, Math.max(55, 84 + dispatched * 2 + (state.lanes - 2) * 4 -
      Math.floor((occupancy.security.length - 38) / 16) - Math.ceil(state.missedPassengers / 5) - Math.floor(state.delayMinutes / 5)));
    $("#cash").textContent = currency.format(state.cash);
    $("#passengers").textContent = occupancy.total;
    $("#satisfaction").textContent = satisfaction + "%";
    $(".clock-day").textContent = "DAY " + String(1 + Math.floor(minutes / 1440)).padStart(2, "0");
    $("#clock").textContent = time;
    $("#clock").setAttribute("datetime", time);
    const complete = shiftComplete();
    $("#run-label").textContent = complete ? "Complete" : state.paused ? "Paused" : "Running";
    $("#run-label").classList.toggle("paused", state.paused && !complete);
    $("#pause-icon").setAttribute("href", state.paused ? "#play" : "#pause");
    $("#pause-toggle").setAttribute("aria-label", state.paused ? "Resume simulation" : "Pause simulation");
    $("#pause-toggle").disabled = complete;
    document.querySelectorAll("[data-speed]").forEach(button => {
      button.disabled = complete;
      button.setAttribute("aria-pressed", String(!complete && !state.paused && state.speed === Number(button.dataset.speed)));
    });
    const terminalOpen = state.view === "terminal";
    const scheduleOpen = state.view === "schedule";
    const flightsOpen = state.view === "flights";
    $("#terminal-tab").setAttribute("aria-pressed", String(terminalOpen));
    $("#schedule-tab").setAttribute("aria-pressed", String(scheduleOpen));
    $("#flights-tab").setAttribute("aria-pressed", String(flightsOpen));
    $("#terminal-view").hidden = !terminalOpen;
    $("#schedule-view").hidden = !scheduleOpen;
    $("#flight-view").hidden = !flightsOpen || complete;
    paintFlights();
    paintDetail();
    if (scheduleOpen) paintSchedule();
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
      upgrade.disabled = complete || state.lanes === 3 || state.cash < laneCost;
      upgrade.innerHTML = state.lanes === 3 ? "All lanes open" : "Open a lane <span>" + currency.format(laneCost) + "</span>";
    }
    $("#goal-bar").style.width = dispatched / timetable.length * 100 + "%";
    $("#goal-count").textContent = dispatched + " / " + timetable.length;
    $("#objective-title").textContent = complete ? "Operating day complete" : "Dispatch " + timetable.length + " flights";
    $("#view-report").hidden = !complete;

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
    const waiting = holdingFlights();
    const holding = flightAtHoldingPoint(waiting);
    if (holding) {
      const route = holding.id + " to " + holding.destination;
      const {time} = takeoffSchedule(holding);
      holdingPinRoute.textContent = route;
      holdingPinTime.dateTime = time;
      holdingPinTime.textContent = time;
      holdingPin.setAttribute("aria-pressed", String(holding.id === state.selected));
      holdingPinCount.hidden = waiting.length === 1;
      holdingPinCount.textContent = waiting.length;
      holdingPin.setAttribute("aria-label", waiting.length + " awaiting taxi-in. " + route + ". Takeoff at " + time);
    }
    for (const {count, section} of mapSigns) {
      if (count) count.textContent = occupancy[section].length;
    }
  }

  function timedTaxiPath(route) {
    let elapsed = 0;
    return route.map(([x, z, angle, speed = taxiSpeed], index) => {
      if (index > 0) {
        const [previousX, previousZ] = route[index - 1];
        elapsed += Math.hypot(x - previousX, z - previousZ) / speed;
      }
      return [elapsed, x, z, angle];
    });
  }

  function makeDeparture(flight) {
    const {x} = gates[flight.gate];
    const halfTurn = Math.PI / 2;
    const path = timedTaxiPath([
      [x, -4.75, 0], [x, -15, 0, pushbackSpeed], [x - 2.1, -22, -halfTurn, pushbackSpeed],
      [-39.7, taxiwayZ, -halfTurn], [-45, taxiwayZ - 2.3, -2.3],
      [-45, runwayZ + 3.8, Math.PI], [-40.4, runwayZ, halfTurn]
    ]);
    const pushbackEnd = path[2][0];
    const runwayEntry = path.at(-1)[0];
    const liftoff = runwayEntry + 6.72;
    const duration = liftoff + 2.4;
    path.push(
      [runwayEntry + 2.76, -17.4, runwayZ, halfTurn], [runwayEntry + 4.8, 12, runwayZ, halfTurn],
      [liftoff, 42, runwayZ, halfTurn], [duration, 86, runwayZ, halfTurn, 16, .23]
    );
    return {flight, start: state.now, duration, path, pushbackEnd, runwayEntry, liftoff};
  }

  function aircraftPosition(flight) {
    if (flight.stage === "holding" || flight.stage === "reserved") return holdingPosition;
    const movement = flight.stage === "inbound" ? state.taxiIn : state.departure;
    if (movement?.flight !== flight) return {x: gates[flight.gate].x, z: -4.75};
    const {path} = movement;
    const elapsed = movementElapsed(movement);
    const end = path.findIndex((point, i) => i > 0 && point[0] >= elapsed);
    const a = path[end - 1], b = path[end];
    const t = (elapsed - a[0]) / (b[0] - a[0]);
    const mix = index => (a[index] || 0) + ((b[index] || 0) - (a[index] || 0)) * t;
    const arc = Math.atan2(Math.sin(b[3] - a[3]), Math.cos(b[3] - a[3]));
    return {x: mix(1), z: mix(2), angle: a[3] + arc * t, y: mix(4), pitch: mix(5)};
  }

  function startTaxiIn(flight) {
    const {x, name} = gates[flight.gate];
    const path = timedTaxiPath([
      [holdingPosition.x, holdingPosition.z, holdingPosition.angle],
      [x + 6, taxiwayZ, holdingPosition.angle], [x + 1.8, -21.2, -.77],
      [x, -17, 0], [x, -4.75, 0]
    ]);
    flight.stage = "inbound";
    state.taxiIn = {flight, start: state.now, duration: path.at(-1)[0], path};
    announce(flight.id + " taxiing to " + name + ".");
  }

  function command() {
    const flight = state.flights.find(item => item.id === state.selected);
    if (!flight || $("#flight-action").disabled) return;
    if (flight.stage === "parked") {
      flight.stage = "boarding";
      announce("Boarding started at " + gates[flight.gate].name + ".");
    } else if (flight.stage === "ready") {
      if (state.nextDeparture === flight) {
        state.nextDeparture = null;
        announce(flight.id + " released the next takeoff slot.");
      } else if (departureBlocked()) {
        state.nextDeparture = flight;
        announce(flight.id + " has the next takeoff slot.");
      } else {
        clearForDeparture(flight);
      }
    } else if (flight.stage === "holding") {
      const gate = selectedGate();
      if (gate < 0) return;
      flight.gate = gate;
      if (taxiwayBusy()) {
        flight.stage = "reserved";
        state.taxiQueue.push(flight);
        announce(gates[gate].name + " reserved for " + flight.id + ".");
      } else {
        startTaxiIn(flight);
      }
    }
    paint();
  }

  function clearForDeparture(flight) {
    state.nextDeparture = null;
    flight.stage = "outbound";
    state.departure = makeDeparture(flight);
    announce(flight.id + " cleared for departure.");
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

  function advanceShift(simDelta) {
    state.now += simDelta;
    const changed = passengerFlow.advance(state.flights, flow, state.now, simDelta, state.lanes,
      flight => {
        flight.stage = "ready";
        announce(flight.id + " is ready for departure.");
      });
    occupancyDirty ||= changed;
    if (state.taxiIn && movementElapsed(state.taxiIn) === state.taxiIn.duration) {
      const {flight} = state.taxiIn;
      state.taxiIn = null;
      occupancyDirty = true;
      flight.stage = "parked";
      announce(flight.id + " parked at " + gates[flight.gate].name + ".");
    }
    if (state.departure && movementElapsed(state.departure) === state.departure.duration) {
      const {flight, start, liftoff} = state.departure;
      state.departure = null;
      occupancyDirty = true;
      const boarded = flight.manifest.filter(person => person.zone === "boarded").length;
      const revenue = 3800 + boarded * passengerFare;
      const liftoffMinute = clockMinutes(start + liftoff);
      const due = clockMinutes(flight.takeoffAt);
      state.delayMinutes += Math.max(0, liftoffMinute - due);
      state.cash += revenue - handlingCost;
      state.results.push({id: flight.id, destination: flight.destination, due, takeoff: liftoffMinute,
        missed: flight.passengers - boarded, revenue});
      state.flights = state.flights.filter(item => item !== flight);
      if (state.selected === flight.id) state.selected = state.flights[0]?.id || "gate-" + flight.gate;
      if (shiftComplete()) {
        state.paused = true;
        announce("Operating day complete. Your shift report is ready.");
        paint();
        showShiftReport();
        return;
      }
      announce(flight.id + " airborne with " + boarded + " passengers. " + currency.format(revenue - handlingCost) + " net.");
    }
    if (state.nextDeparture && !departureBlocked()) clearForDeparture(state.nextDeparture);
    if (state.taxiQueue.length && !taxiwayBusy()) startTaxiIn(state.taxiQueue.shift());
    for (const flight of state.flights) {
      if (flight.stage === "scheduled" && state.now >= flight.arrivalAt) {
        flight.stage = "holding";
        occupancyDirty = true;
        announce(flight.id + " awaiting a gate assignment.");
      }
    }
  }

  function update(dt) {
    if (state.paused) return;
    let remaining = dt * state.speed;
    // Keep queue processing and walking on small steps at accelerated speeds.
    while (remaining > 0 && !shiftComplete()) {
      const step = Math.min(remaining, .05);
      advanceShift(step);
      remaining -= step;
    }
  }

  const report = $("#shift-report");

  function showShiftReport() {
    const results = state.results.slice().sort((a, b) => a.due - b.due);
    const onTime = results.filter(({due, takeoff}) => takeoff <= due).length;
    const revenue = results.reduce((total, flight) => total + flight.revenue, 0);
    const handling = results.length * handlingCost;
    const security = (state.lanes - 2) * laneCost;
    $("#report-on-time").textContent = onTime + " / " + results.length;
    $("#report-missed").textContent = results.reduce((total, flight) => total + flight.missed, 0);
    $("#report-profit").textContent = currency.format(revenue - handling - security);
    $("#report-finances").innerHTML = stat("Flight revenue", currency.format(revenue)) +
      stat("Ground handling", currency.format(-handling)) + stat("Extra security lane", currency.format(0 - security));
    $("#report-flights").innerHTML = results.map(({id, destination, due, takeoff, missed}) =>
      '<tr><th scope="row">' + id + '<span>' + destination + '</span></th><td>' + formatTime(due) +
      '</td><td>' + formatTime(takeoff) + (takeoff > due ? '<span class="report-late">+' + (takeoff - due) + ' min</span>' : '') +
      '</td><td>' + missed + '</td></tr>').join("");
    report.showModal();
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
    const holding = flightAtHoldingPoint();
    const moving = state.flights.filter(flight => !isArriving(flight) || flight.stage === "inbound" || flight === holding)
      .map(flight => ({mesh: planes[flight.airline], ...aircraftPosition(flight), flightId: flight.id}));
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
        (element === holdingPin && (!holding || left < 90 || left > renderer.view.width - 90));
    }
  }

  function togglePause() {
    if (shiftComplete()) return;
    state.paused = !state.paused;
    paint();
  }

  $("#flights-tab").addEventListener("click", () => notifyTab("flights"));
  $("#schedule-tab").addEventListener("click", () => notifyTab("schedule"));
  $("#terminal-tab").addEventListener("click", () => notifyTab("terminal"));
  $("#show-map").addEventListener("click", () => showMobileView("map"));
  $("#show-operations").addEventListener("click", () => showMobileView("operations"));
  $("#flight-action").addEventListener("click", command);
  $("#close-boarding").addEventListener("click", closeSelectedBoarding);
  $("#pause-toggle").addEventListener("click", togglePause);
  $("#view-report").addEventListener("click", showShiftReport);
  $("#close-report").addEventListener("click", () => report.close());
  $("#restart-shift").addEventListener("click", () => {
    state = createShift();
    flow = passengerFlow.create(state.flights, state.lanes);
    occupancyDirty = true;
    $("#upcoming").open = false;
    report.close();
    $(".panel-body").scrollTop = 0;
    showMobileView("map");
    fit();
    announce("Operating day started. Boarding underway at A01.");
    paint();
    (mobileLayout.matches ? $("#show-operations") : $("#flights-tab")).focus({preventScroll: true});
  });
  report.addEventListener("close", () => {
    if (!shiftComplete()) return;
    if (mobileLayout.matches) showMobileView("operations");
    $("#view-report").focus();
  });
  function openLane() {
    if (shiftComplete() || state.lanes !== 2 || state.cash < laneCost) return;
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
    if (report.open || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
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
    const drawDue = requestDraw || (!shiftComplete() && !state.paused && timestamp - lastDraw >= 32);
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

STATIC_FILES = index.html styles.css renderer.js layout.js airport.js passengers.js baggage.js game.js

.PHONY: build package
build:
	mkdir -p dist
	cp $(STATIC_FILES) dist/

package: build
	@set -eu; \
	archive=$$(mktemp .airport-sim.XXXXXX); \
	trap 'rm -f "$$archive"' EXIT; \
	(cd dist && zip -q -X - $(STATIC_FILES)) > "$$archive"; \
	mv "$$archive" airport-sim.zip

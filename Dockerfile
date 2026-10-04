FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS engine
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git cmake ninja-build python3 unzip p7zip-full ccache xz-utils bzip2 && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch 3.1.6 https://github.com/emscripten-core/emsdk.git /opt/emsdk && /opt/emsdk/emsdk install 3.1.6 && /opt/emsdk/emsdk activate 3.1.6
COPY public/source/NewShoes-source.zip.part* /tmp/
RUN cat /tmp/NewShoes-source.zip.part01 /tmp/NewShoes-source.zip.part02 > /tmp/source.zip && echo 'fe6179f0013b035bb1211f0946976c4bf95b242a62e43c2956c34b126818a8c9  /tmp/source.zip' | sha256sum -c - && unzip -qo /tmp/source.zip -d /tmp/source && mv /tmp/source/NewShoes-main /opt/newshoes
WORKDIR /opt/newshoes/WebAssembly
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 CMAKE_BUILD_PARALLEL_LEVEL=2
COPY build/package.json build/package-lock.json ./
RUN npm ci --no-audit --no-fund && bash -c 'source /opt/emsdk/emsdk_env.sh >/dev/null && export PATH=/usr/local/bin:$PATH && npm run build:port:threaded:release'

FROM node:22-bookworm-slim AS site
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY public ./public
COPY tools/server.mjs ./tools/server.mjs
COPY tools/yuri-relay ./tools/yuri-relay
COPY --from=engine /opt/newshoes/WebAssembly/dist-threaded-release ./public/dist-threaded-release
ENV HOST=0.0.0.0 PORT=8093
EXPOSE 8093
CMD ["node","tools/server.mjs"]


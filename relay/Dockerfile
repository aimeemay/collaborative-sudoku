# Tinylicious Fluid relay for online play.
# Pinned to 7.0.0 to match the version used locally (must stay compatible with
# the @fluidframework/azure-client version in the app's package.json).
FROM node:20-slim

# Install the exact tinylicious version the app is built against.
RUN npm install -g tinylicious@7.0.0

# Tinylicious reads PORT (defaults to 7070). Fly routes external 443 -> this.
ENV PORT=7070
EXPOSE 7070

CMD ["tinylicious"]

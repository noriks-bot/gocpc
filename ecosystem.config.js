module.exports = {
  apps: [{
    name: 'gocpc',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3011
    },
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    time: true
  }]
};

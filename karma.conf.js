module.exports = function(config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine'],
    files: [
      'app/js/*.js',
      'spec/*.js'
    ],
    exclude: [
      '**/bootstrap*.js',
      '**/dust*.js',
      '**/d3*.js',
      '**/*.swp',
      '**/*.swo'
    ],
    preprocessors: {
    },
    reporters: ['spec'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    browsers: ['PhantomJS'],
    singleRun: false,
    concurrency: Infinity
  })
}

var gulp = require('gulp');
var jshint = require('gulp-jshint');
var shell = require('gulp-shell');
var sass = require('gulp-sass');
var Karma = require('karma').Server;
var uglify = require('gulp-uglify');

gulp.task('doc',
    shell.task(['jsdoc ./ruruki_eye/static/js/ruruki-eye.js -d ./docs/js'])
);

gulp.task('lint', function () {
    gulp.src([
        './app/js/ruruki-eye.js',
        './spec/*.js'
    ])
    .pipe(jshint())
    .pipe(jshint.reporter('default'));
});

gulp.task('sass', function() {
    return gulp.src(['app/scss/*.scss'])
    .pipe(sass())
    .pipe(gulp.dest('ruruki_eye/static/css'));
});

gulp.task('test', function(done) {
    return new Karma({
        configFile: __dirname + '/karma.conf.js',
        singleRun: true
    }, done).start();
});

gulp.task('dist', function() {
    return gulp.src(['app/js/*.js'])
    .pipe(uglify())
    .pipe(gulp.dest('ruruki_eye/static/js'));
});

gulp.task('watch', function() {
    gulp.watch('app/scss/*.scss', ['sass']);
    gulp.watch(
        ['app/js/*.js', 'spec/*.js'],
        ['lint', 'test', 'dist']
    );
});

gulp.task('default', ['watch']);

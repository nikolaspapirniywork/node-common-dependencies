'use strict';

var gulp = require('gulp');

// load plugins
var $ = require('gulp-load-plugins')(),
    gutil = require('gulp-util'),
    sass = require('gulp-sass'),
    sourcemaps = require('gulp-sourcemaps'),
    minifyCss = require('gulp-minify-css'),
    runSequence = require('run-sequence'),
    concatFilenames = require('gulp-concat-filenames'),
    concat = require('gulp-concat'),
    watch = require('gulp-watch'),
    removeUnusedCss = require('gulp-remove-unused-css'),
    fs = require("fs"),
    combineMq = require('gulp-combine-mq'),
    replace = require('gulp-replace'),
    insert = require('gulp-insert'),
    newer = require('gulp-newer'),
    add = require('gulp-add'),
    rename = require("gulp-rename"),
    checkFilesize = require("gulp-check-filesize"),
    plumber = require('gulp-plumber'),
    rimraf = require('rimraf');

var urlAdjuster = require('gulp-css-url-adjuster');
var gulpif = require('gulp-if');
var argv = require('minimist')(process.argv.slice(2));
var lazypipe = require('lazypipe');

// paths to resources
var paths = {
    plugins: ['bower_components/modernizr/modernizr.js'],
    images: 'build/images/**/*',

    blocksFolder: './styles/blocks',

    sassFilesPath: ['./styles/*.scss',
        './styles/**/*.scss',
        '!./styles/**/_*.scss',
        '!./styles/common/holsters/**/*.scss'
    ],
    allBlocksFiles: [
        './styles/blocks/**/*.scss',
        '!./styles/blocks/**/_*.scss',                      // exclude partials
        '!/**/blocks.scss'
    ],
    blocksOnlyFiles: [
        './styles/blocks/**/*.scss',
        '!./styles/blocks/**/_*.scss',                      // exclude partials
        '!./styles/blocks/*--cp/*.scss',                      // exclude critical path blocks
        '!/**/blocks.scss',
        '!/**/critical-path.scss'
    ],
    criticalPathFiles: [
        './styles/blocks/*--cp/*.scss',
        '!./styles/blocks/**/_*.scss'                      // exclude partials
    ],
    holstersFilesPath: [
        './styles/common/holsters/*.scss',
        './styles/common/holsters/**/*.scss'
    ]
};

// destinations for resources npm install --save critical
var dest = {
    css: '',
    scripts: 'js',
    images: 'images',

    //
    dist: 'dist'
};

var files = {
    main: 'main.css',
    critical: 'critical-path.css',
    critical_php: 'critical-path.php'
};

var partialsFolderToRecompile = '';
var partialsGlobToRecompile = '';

// CLI options
var enabled = {
    // Enable static asset revisioning when `--production`
    prod: argv.production,
    // Disable source maps when `--production`
    maps: !argv.production
};

gulp.task('sass:compile', function (cb) {
    return runSequence('sass:blocks_list', 'sass', 'styles:add-css-imports', cb);
});


var blocksList = function (config) {
    return gulp
        .src(config.files)
        .pipe(concatFilenames(config.blocksFile, {
            root: 'styles/blocks',
            prepend: '@import "',
            append: '";'
        }))
        .pipe(gulpif(!config.isDist, replace('scss', 'css')))
        .pipe(gulp.dest(config.dest));
};

gulp.task('sass:blocks_list', function () {
    return blocksList({
        files: paths.allBlocksFiles,
        dest: './' + dest.dist + '/blocks',
        blocksFile: 'blocks.css'
    });
});

gulp.task('sass:blocks_list:dist', function () {
    return blocksList({
        files: paths.blocksOnlyFiles,
        dest: paths.blocksFolder,
        blocksFile: 'blocks.scss',
        isDist: true
    });
});

gulp.task('critical:blocks_list:dist', function () {
    return blocksList({
        files: paths.criticalPathFiles,
        dest: paths.blocksFolder,
        blocksFile: 'critical-path.scss',
        isDist: true
    });
});

gulp.task('styles:add-css-imports', function (cb) {
    return gulp.src('no_files')
        .pipe(add({
            'dist/main.css': '@import "../styles/compiled/bootstrap-inline.css"; ' +
            '@import "blocks/blocks.css"; ' +
            '@import "../styles/compiled/holsters.css";'
        }))
        .pipe(gulp.dest(''));
});

var sassChannel = lazypipe()
    .pipe(function () {
        return gulpif(enabled.maps, sourcemaps.init());
    })
    .pipe(function () {
        return gulpif(!enabled.prod, plumber())
    })
    .pipe(function () {
        return sass()
            .on('error', gutil.log.bind(gutil, 'Sass Error'));
    })
    .pipe(function () {
        return gulpif(!enabled.prod, replace('___ini', ':not(simple_class_but_critical)'))
    })
    .pipe(function () {
        return gulpif(!enabled.prod, urlAdjuster({
            prepend: '../../', // from dest.dist folder
            append: ''
        }));
    })
    .pipe(function () {
        return $.autoprefixer('last 2 version', 'safari 5', 'ie 8', 'ie 9', 'opera 12.1', 'ios 6', 'android 4');
    })
    .pipe(function () {
        return gulpif(enabled.maps, sourcemaps.write());
    });

function onSassFail(err) {
    console.error(err.message);
    this.emit('end');
}

var runSass = function (config) {
    return gulp.src(config.patternFiles)
        .pipe(sassChannel().on('error', onSassFail))
        .pipe(gulp.dest(config.dist));
};

//sass
gulp.task('sass', function () {
    return runSass({
        patternFiles: ['styles/**/*.scss', '!/**/blocks.scss', '!/**/main.scss', '!/**/holsters.scss', '!/**/critical-path.scss'],
        dist: dest.dist
    });
});

gulp.task('sass:partials', function () {
    return runSass({patternFiles: [partialsGlobToRecompile], dist: dest.dist + '/blocks/' + partialsFolderToRecompile});
});

gulp.task('sass:changed', function () {
    return gulp.src(['styles/**/*.scss', '!/**/blocks.scss', '!styles/common/holsters**/*.scss', '!/**/critical-path.scss'])
        //.pipe(newer({dest: dest.dist, ext: '.css'}))
        //     .pipe(sassChannel().on('error', onSassFail))
        .pipe(sass())
        .pipe(gulp.dest(dest.dist));
});

gulp.task('sass:dist', ['sass:blocks_list:dist'], function () {
    enabled.prod = true;
    return gulp.src('styles/main.scss')
        .pipe(sassChannel())
        .pipe(gulp.dest(dest.dist));
});

gulp.task('critical:sass:dist', ['critical:blocks_list:dist'], function () {
    enabled.prod = true;
    return gulp.src('styles/blocks/critical-path.scss')
        .pipe(sassChannel())
        .pipe(gulp.dest(dest.dist));
});

gulp.task('styles:remove-unused-css', function (cb) {
    return gulp.src(dest.dist + '/' + files.main, {buffer: false})
        .pipe(removeUnusedCss({
            path: ['**/*.php', 'js/**/*.js']
        }))
        .pipe(gulp.dest(dest.dist));
});

gulp.task('styles:cmq', function () {
    return gulp.src(dest.dist + '/' + files.main)
        .pipe(combineMq({
            beautify: true,
            use_external: true
        }))
        .pipe(gulp.dest(dest.dist));
});

gulp.task('styles:minify', function () {
    return gulp.src(dest.dist + '/' + files.main)
        .pipe(minifyCss({compatibility: 'ie8', keepSpecialComments: 1}))
        .pipe(gulp.dest(dest.dist));
});

gulp.task('styles:concat', function () {
    return gulp.src([dest.dist + '/' + files.main])
        .pipe(concat(files.main))
        .pipe(gulp.dest(dest.dist));
});

gulp.task('styles:ensureFileSize', function () {
    return gulp.src(dest.dist + '/' + files.main)
        .pipe(checkFilesize({
            enableGzip: true,
            fileSizeLimit: 20240
        }))
        .pipe(gulp.dest(dest.dist));
});

gulp.task('styles:dist', ['sass:dist'], function (cb) {
    enabled.prod = true;
    return runSequence('styles:concat', 'styles:remove-unused-css', 'styles:cmq', 'styles:minify', 'styles:ensureFileSize', cb);
});

gulp.task('critical:dist', function () {
    enabled.prod = true;
    return runSequence(
        'critical:sass:dist',
        'critical:concat',
        'critical:remove-unused-css',
        'critical:cmq',
        'critical:minify',
        'critical:ensureFileSize',
        'critical:replace-urls',
        'critical:to-php',
        'critical:clean'
    );
});

gulp.task('critical:concat', function () {
    return gulp.src([
        'styles/compiled/bootstrap-inline.css',
        'styles/compiled/holsters.css',
        dest.dist + '/' + files.critical
    ])
        .pipe(concat(files.critical))
        .pipe(gulp.dest(dest.dist));
});

gulp.task('critical:remove-unused-css', function (cb) {
    return gulp.src(dest.dist + '/' + files.critical, {buffer: false})
        .pipe(removeUnusedCss({
            path: ['**/*.php', 'js/**/*.js']
        }))
        .pipe(gulp.dest(dest.dist));
});

gulp.task('critical:cmq', function () {
    return gulp.src(dest.dist + '/' + files.critical)
        .pipe(combineMq({
            beautify: true,
            use_external: true
        }))
        .pipe(gulp.dest(dest.dist));
});

gulp.task('critical:minify', function () {
    return gulp.src(dest.dist + '/' + files.critical)
        .pipe(minifyCss({compatibility: 'ie8', keepSpecialComments: 1}))
        .pipe(gulp.dest(dest.dist));
});

gulp.task('critical:ensureFileSize', function () {
    return gulp.src(dest.dist + '/' + files.critical)
        .pipe(checkFilesize({
            enableGzip: true,

            fileSizeLimit: 10240
        }))
        .pipe(gulp.dest(dest.dist));
});

gulp.task('critical:replace-urls', function () {
    return gulp.src(dest.dist + '/' + files.critical)
        .pipe(replace('..', ''))
        .pipe(replace(/url\((.*?)\)/g, 'url(<?php echo get_template_directory_uri()?>$1)'))
        .pipe(gulp.dest(dest.dist));
});

gulp.task('critical:to-php', function () {
    return gulp.src(dest.dist + '/' + files.critical)
        .pipe(insert.wrap('<style>', '</style>'))
        .pipe(rename(files.critical_php))
        .pipe(gulp.dest(dest.dist));
});

gulp.task('critical:clean', function (cb) {
    return rimraf(dest.dist + '/' + files.critical, cb);
});

gulp.task('holsters:generate', function () {
    return gulp.src('styles/common/holsters/holsters.scss')
        .pipe(sass()
            .on('error', gutil.log.bind(gutil, 'Sass Error')))
        .pipe($.autoprefixer('last 2 version', 'safari 5', 'ie 8', 'ie 9', 'opera 12.1', 'ios 6', 'android 4'))
        .pipe(minifyCss({compatibility: 'ie8', keepSpecialComments: 1}))
        .pipe(gulp.dest('styles/compiled/'));
});

gulp.task('holsters:changed', function () {
    return gulp.src(['styles/common/holsters/**/*.scss'])
        .pipe(newer({dest: 'styles/compiled', ext: '.css'}))
        .pipe(sassChannel())
        .pipe(gulp.dest('styles/compiled'));
});

// perform jshint on javascript files
/*gulp.task('jshint', function () {
 return gulp.src(paths.scripts)
 .pipe($.jshint())
 .pipe($.jshint.reporter('jshint-stylish'))
 .pipe($.jshint.reporter('fail'))
 .pipe($.size());
 });

 // uglify, rename and move destination of the main.js file
 gulp.task('jsmain', function () {
 return gulp.src(paths.main)
 .pipe(gulp.dest(dest.scripts))
 .pipe($.size())
 .pipe($.uglify())
 .pipe($.rename('main.min.js'))
 .pipe(gulp.dest(dest.scripts))
 .pipe($.size())
 });

 // Combine the list of plugins (uncompressed) used via bower, concat, move, uglify, move
 gulp.task('jsplugins', function () {
 return gulp.src(paths.plugins)
 .pipe($.concat('plugins.js'))
 .pipe(gulp.dest(dest.scripts))
 .pipe($.size())
 .pipe($.uglify())
 .pipe($.rename('plugins.min.js'))
 .pipe(gulp.dest(dest.scripts))
 .pipe($.size())
 });*/

// compress images
gulp.task('images', function () {
    return gulp.src(paths.images)
        .pipe($.cache($.imagemin({
            optimizationLevel: 3,
            progressive: true,
            interlaced: true
        })))
        .pipe(gulp.dest(dest.images))
        .pipe($.size());
});

// Clean up dist and temporary
gulp.task('clean', function (cb) {
    return rimraf(dest.dist, cb);
});

gulp.task('build', ['clean'], function (cb) {
    enabled.prod = true;
    return runSequence('critical:dist', 'holsters:changed', 'styles:dist', cb);
});

gulp.task('default', ['watch']);

gulp.task('watch', ['clean', 'sass:compile'], function (cb) {
    // Generate blocks list
    watch([paths.blocksFolder + '/**/*.scss', '!' + paths.blocksFolder + '/**/_*.scss'], function (events) {
        if ('add' === events.event || 'unlink' === events.event) {
            return gulp.start('sass:compile');
        }
    });

    // Sass recompile
    watch(paths.sassFilesPath, function (events) {
        if ('change' === events.event) {
            return gulp.start('sass:changed');
        }
    });

    // Partials recompile
    watch([paths.blocksFolder + '/**/_*.scss'], function (events) {
        var filePath = (events.history[0]).replace(/\\/g, '/');
        gulp
        var pathToFolder = filePath.substring(0, filePath.lastIndexOf('/'));
        var folderName = pathToFolder.substring(pathToFolder.lastIndexOf('/') + 1, pathToFolder.length);

        partialsFolderToRecompile = folderName;
        partialsGlobToRecompile = pathToFolder + '/*.scss';

        gulp.start('sass:partials');
    });

    // Holsters
    watch(paths.holstersFilesPath, function (events) {
        return gulp.start('holsters:generate');
    });
});

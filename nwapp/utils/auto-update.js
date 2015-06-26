'use strict';

var log = require('loglevel');
var notifier = require('./notifier');
var pkg = require('../package.json');
var gui = window.require('nw.gui');
var os = require('./client-type');
var Updater = require('node-webkit-updater');

var updater = new Updater(pkg);


function downloadUpdate(manifest, cb) {
  // node-webkit-updater:
  // * doesnt clean up after itself
  // * doesnt download to unique temp locations
  // ...but its the best we have at the moment
  updater.download(function(err, newAppPackage) {
    if (err) return cb(err);

    updater.unpack(newAppPackage, function(err, newAppExecutable) {
      if (err) return cb(err);

      cb(newAppExecutable);
    // updater.unpack has an ugly api
    }, manifest);

  // updater.download has an ugly api
  }, manifest);
}

function notifyLinuxUser(version) {
  setInterval(function() {
    notifier({
      title: 'Gitter ' + version + ' Available',
      message: 'Head over to gitter.im/apps to update.'
    });
  }, 30 * 1000);
}

function notifyWinOsxUser(version, newAppExecutable) {
  setInterval(function() {
    notifier({
      title: 'Gitter ' + version + ' Available',
      message: 'Click to restart and apply update.',
      click: function() {
        log.info('Starting new app to install itself');
        updater.runInstaller(newAppExecutable, [updater.getAppPath(), updater.getAppExec()], {});

        log.info('Quitting outdated app');
        gui.App.quit();
      }
    });
  }, 30 * 1000);
}


function listen() {

  function update() {
    updater.checkNewVersion(function (err, newVersionExists, newManifest) {
      if (err) {
        log.error('request for app update manifest failed', err);
        return tryAgainLater();
      }

      if (!newVersionExists) {
        log.info('app currently at latest version');
        return tryAgainLater();
      }

      // Update available!
      var version = newManifest.version;

      if (os === 'linux') {
        // linux cannot autoupdate (yet)
        return notifyLinuxUser(version);
      }

      downloadUpdate(newManifest, function(err, newAppLocation) {
        if (err) {
          log.error('app update ' + version + ' failed to download and unpack', err);
          return tryAgainLater();
        }

        return notifyWinOsxUser(version, newAppLocation);
      });
    });
  }

  // polling with setInterval messes up on windows during sleep.
  // the network requests bunch up, so its best to wait for the updater
  // to finish each poll before triggering a new request.
  function tryAgainLater() {
    log.info('trying app update again in 30 mins');
    setTimeout(update, 30 * 60 * 1000);
  }

  // update() retries on failure, so only call once.
  update();
}

function overwriteOldApp(oldAppLocation, executable) {
  updater.install(oldAppLocation, function(err) {
    if (err) {
      log.error('update failed, shutting down installer', err.stack);
      return gui.App.quit();
    }

    // The recommended updater.run(execPath, null) [1] doesn't work properly on Windows.
    // It spawns a new child process but it doesn't detach so when the installer app quits the new version also quits. :poop:
    // [1] https://github.com/edjafarov/node-webkit-updater/blob/master/examples/basic.js#L29
    // https://github.com/edjafarov/node-webkit-updater/blob/master/app/updater.js#L404-L416
    log.info('starting new version');
    updater.run(executable, [], {});

    // wait for new version to get going...
    setTimeout(function() {
      log.info('shutting down installer');
      gui.App.quit();
    }, 5000);
  });
}

module.exports = {
  listen: listen,
  overwriteOldApp: overwriteOldApp
};

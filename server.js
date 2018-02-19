const express = require('express');
const assert = require('assert');
const multer = require('multer');
const {spawn} = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const {StringDecoder} = require('string_decoder');

const PORT = process.env.PORT || 3000;

// ---------------------------------------- //

let nextTaskID = 1;

function allocateDir (req) {
  if (req.taskDir) return Promise.resolve();
  req.taskID = nextTaskID++;
  req.taskDir = `data/tasks/task-${req.taskID}`;
  return fs.emptyDir(req.taskDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    allocateDir(req).then(() => cb(null, req.taskDir));
  },
  filename: (req, file, cb) => {
    assert(file.originalname.match(/^[\w-]+\.fbx$/i), 'Invalid filename.');
    cb(null, `${file.originalname}`);
  }
});
const upload = multer({
  storage: storage,
  limits: {fileSize: 50000000}
});

// ---------------------------------------- //

const app = express();

app.use(express.static('status'));
app.use(express.static('data'));

app.post('/v1/convert/', upload.single('model'), (req, res) => {
  const model = req.file;
  console.log(model);

  if (!model) {
    res.status(400).send({ok: false, error: 'Missing or invalid FBX file.'});
    return;
  }

  let basename = path.basename(model.filename, '.fbx');
  let fileIn = `${req.taskDir}/${model.filename}`;
  let folderOut = `${req.taskDir}/${basename}`;

  new Promise((resolve, reject) => {
      // convert
      const gen = spawn(`bin/FBX2glTF-${process.platform}-x64`, [
        '-i', fileIn,
        '-o', folderOut,
        '--binary'
      ]);

      // propagate logs
      const decoder = new StringDecoder('utf8');
      gen.stdout.on('data', (data) => console.log(decoder.write(data)));
      gen.stderr.on('data', (data) => console.warn(decoder.write(data)));

      // resolve on completion
      gen.on('close', (code) => {
        code === 0 ? resolve() : reject(`Failed with code ${code}.`);
      });
    })
    .then(() => fs.remove(fileIn))
    .then(() => {
      res.send({ok: true, path: `${folderOut}.glb`});
    }).catch((e) => {
      console.error(e);
      res.status(500).send({ok: false, error: 'Sorry, something went wrong.'});
    });

});

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

// ---------------------------------------- //

import * as THREE from 'three'
import {VRButton} from 'three/examples/jsm/webxr/VRButton.js'
import {XRControllerModelFactory} from 'three/examples/jsm/webxr/XRControllerModelFactory.js'
import Stats from 'stats-js/src/Stats'
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js'
import {CannonHelper} from './utils/CannonHelper.js'
import * as CANNON from "cannon/build/cannon"
import {fetchProfile} from "three/examples/jsm/libs/motion-controllers.module"

const DEFAULT_PROFILES_PATH = 'webxr-input-profiles';
const DEFAULT_PROFILE = 'generic-trigger';

class App {
  constructor() {
    const container = document.createElement('div')
    document.body.appendChild(container)

    this.clock = new THREE.Clock()

    this.camera = new THREE.PerspectiveCamera(50,
        window.innerWidth / window.innerHeight, 0.1, 100)
    this.camera.position.set(0, 1.6, 0)
    this.camera.lookAt(0, 0, -2)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x505050)

    this.scene.add(new THREE.HemisphereLight(0x555555, 0xFFFFFF))

    const light = new THREE.DirectionalLight(0xffffff)
    light.position.set(1, 1.25, 1.25).normalize()
    light.castShadow = true
    const size = 15
    light.shadow.left = -size
    light.shadow.bottom = -size
    light.shadow.right = size
    light.shadow.top = size
    this.scene.add(light)

    this.renderer = new THREE.WebGLRenderer({antialias: true})
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.shadowMap.enabled = true
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.outputEncoding = THREE.sRGBEncoding

    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 0, -3)
    this.controls.update()

    this.stats = new Stats()
    document.body.appendChild( this.stats.dom )

    this.initScene()
    this.setupVR()

    this.renderer.setAnimationLoop(this.render.bind(this))

    this.raycaster = new THREE.Raycaster()
    this.workingMatrix = new THREE.Matrix4()
    this.origin = new THREE.Vector3()

    window.addEventListener('resize', this.resize.bind(this))
  }

  initScene() {

    //Create a marker to indicate where the joint is
    const geometry = new THREE.SphereBufferGeometry(0.1, 8, 8)
    const material = new THREE.MeshStandardMaterial({color: 0xaa0000})
    this.marker = new THREE.Mesh(geometry, material)
    this.marker.visible = false
    this.scene.add(this.marker)

    this.initPhysics()
  }

  initPhysics() {
this.world = new CANNON.World()

    this.dt = 1.0 / 60.0
    this.damping = 0.01

    this.world.broadphase = new CANNON.NaiveBroadphase
    this.world.gravity.set(0, -10, 0)

    this.helper = new CannonHelper(this.scene, this.world)

    const groundShape = new CANNON.Plane()
    const groundBody = new CANNON.Body({mass: 0});
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0),
    -Math.PI / 2)
    groundBody.addShape(groundShape)
    this.world.add(groundBody)
    this.helper.addVisual(groundBody, 0x8B008B)

    const shape = new CANNON.Sphere(0.1)
    this.jointBody = new CANNON.Body({mass: 0})
    this.jointBody.addShape(shape)
    this.jointBody.collisionFilterGroup = 0
    this.jointBody.collisionFilterMask = 0
    this.world.add(this.jointBody)

    this.movableObjects = []
    this.box = this.addBody()
    this.movableObjects.push(this.box)
    this.movableObjects.push(this.addBody(true, -1.5, 2, -3))
    this.movableObjects.push(this.addBody(true, 1.5, 2, -3))
    this.movableObjects.push(this.addBody(true, 0, 2, -3))
  }

  addBody(box = true,x = 0, y = 1, z = -3) {
let shape
    if (!box) {
      shape = new CANNON.Sphere(0.5)
    } else {
      shape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5))
    }
    const material = new CANNON.Material()
    const body = new CANNON.Body({mass: 5, material: material})
    body.addShape(shape)

    body.position.set(x, y, z)
    body.linearDamping = this.damping
    this.world.add(body)

    this.helper.addVisual(body)

    return body
  }

  addConstraint(pos, body) {
const pivot = pos.clone()
    body.threemesh.worldToLocal(pivot)

    this.jointBody.position.copy(pos)

    const constrain = new CANNON.PointToPointConstraint(body, pivot,
        this.jointBody, new CANNON.Vec3(0, 0, 0))

    this.world.addConstraint(constrain)

    this.controller.userData.constraint = constrain
  }

  setupVR() {
    this.renderer.xr.enabled = true
    document.body.appendChild(VRButton.createButton(this.renderer))

    const self = this

    function onSelectStart() {

      this.userData.selectPressed = true
      if (this.userData.selected) {
        self.addConstraint(self.marker.getWorldPosition(self.origin), this.userData.body)
        self.controller.attach(self.marker)
      }
    }

    function onSelectEnd() {

      this.userData.selectPressed = false
      const constraint = self.controller.userData.constraint
      if (constraint) {

        self.world.removeConstraint(constraint)
        self.controller.userData.constraint = undefined
        self.scene.add(self.marker)
        self.marker.visible = false
      }
    }

    this.controller = this.renderer.xr.getController(0)
    this.controller.addEventListener('selectstart', onSelectStart)
    this.controller.addEventListener('selectend', onSelectEnd)
    this.controller.addEventListener('connected', function (event) {

        self.onConnect.call(self, event)
      const mesh = self.buildController.call(self, event.data)
      mesh.scale.z = 0
      this.add(mesh)

    })
    this.controller.addEventListener('disconnected', function () {

      this.remove(this.children[0])
      self.controller = null
      self.controllerGrip = null

    })
    this.scene.add(this.controller)

    const controllerModelFactory = new XRControllerModelFactory()

    this.controllerGrip = this.renderer.xr.getControllerGrip(0)
    this.controllerGrip.add(
        controllerModelFactory.createControllerModel(this.controllerGrip))
    this.scene.add(this.controllerGrip)
  }

  buildController(data) {
    let geometry, material

    switch (data.targetRayMode) {

      case 'tracked-pointer':

        geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position',
            new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3))
        geometry.setAttribute('color',
            new THREE.Float32BufferAttribute([0.5, 0.5, 0.5, 0, 0, 0], 3))

        material = new THREE.LineBasicMaterial(
            {vertexColors: true, blending: THREE.AdditiveBlending})

        return new THREE.Line(geometry, material)

      case 'gaze':

        geometry = new THREE.RingBufferGeometry(0.02, 0.04, 32).translate(0, 0,
            -1)
        material = new THREE.MeshBasicMaterial(
            {opacity: 0.5, transparent: true})
        return new THREE.Mesh(geometry, material)
    }

  }

  handleController(controller) {
      const dt = this.clock.getDelta()
      if(this.renderer.xr.isPreseting){
          if(!this.elapsedTime){
              this.elapsedTime = 0
          }
          this.elapsedTime += dt
          if (this.elapsedTime > 0.3) {
              this.updateGamepadState()
              this.updateUI(this.leftUi, this.buttonStates)
              this.elapsedTime = 0
          }
      }
      if (!controller.userData.selectPressed) {
      controller.children[0].scale.z = 10

      this.workingMatrix.identity().extractRotation(controller.matrixWorld)

      this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld)
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(
          this.workingMatrix)

      const intersectsBodies = []
      this.movableObjects.forEach(element =>
          intersectsBodies.push({
            intersects: this.raycaster.intersectObject(element.threemesh.children[0]),
            body: element
          })
      )
      const intersectBody = intersectsBodies
          .filter(element => element.intersects.length > 0)
          .sort((firstEl, secondEl) => firstEl.intersects[0].distance
              - secondEl.intersects[0].distance)
          .at(0)

      const intersects = this.raycaster.intersectObject(
          this.box.threemesh.children[0])

      if (intersectBody) {
        this.intersectBody = intersectBody
        this.marker.position.copy(intersectBody.intersects[0].point)
        this.marker.visible = true
        controller.children[0].scale.z = intersectBody.intersects[0].distance
        controller.userData.body = intersectBody.body
        controller.userData.selected = true
      } else {
        this.marker.visible = false
        controller.userData.selected = false
      }
    } else {
      const constraint = controller.userData.constraint
      if (constraint) {
          const ray = new THREE.Ray()
          const direction = new THREE.Vector3()
          direction.copy(this.marker.position)
          direction.normalize()
          ray.direction.copy(direction)
          const position = new THREE.Vector3()

          const yAxis = -.04 * Number(this.buttonStates["xr_standard_thumbstick"].yAxis)
            //const yAxis = -.04 * Number(-1)

          if (yAxis !== 0){
              const distance = controller.children[0].scale.z + yAxis
              controller.children[0].scale.z = distance

              ray.at(distance, position)
              this.marker.position.copy(position)
          }
        this.jointBody.position.copy(this.marker.getWorldPosition(this.origin))
        constraint.update();
      }
    }
  }
    createButtonStates(components) {
        const buttonStates = {}
        this.gamepadIndices = components
        Object.keys(components).forEach(key => {
            if (key.includes('touchpad') || key.includes('thumbstick')) {
                buttonStates[key] = { button: 0, xAxis: 0, yAxis: 0 }
            } else {
                buttonStates[key] = 0
            }
        })
        this.buttonStates = buttonStates
    }

    updateGamepadState() {
        const session = this.renderer.xr.getSession()
        const inputSource = session.inputSources[this.index]
        if (inputSource && inputSource.gamepad && this.gamepadIndices && this.buttonStates) {
            const gamepad = inputSource.gamepad
            try {
                Object.entries(this.buttonStates).forEach(([key, value]) => {
                    const buttonIndex = this.gamepadIndices[key].button
                    if (key.includes('touchpad') || key.includes('thumbstick')) {
                        const xAxisIndex = this.gamepadIndices[key].xAxis
                        const yAxisIndex = this.gamepadIndices[key].yAxis
                        this.buttonStates[key].button = gamepad.buttons[buttonIndex].value
                        this.buttonStates[key].xAxis = gamepad.axes[xAxisIndex].toFixed(2)
                        this.buttonStates[key].yAxis = gamepad.axes[yAxisIndex].toFixed(2)
                    } else {
                        this.buttonStates[key] = gamepad.buttons[buttonIndex].value
                    }
                })
            } catch (e) {
                console.warn("An error occurred setting the ui")
            }
        }
    }

    onConnect(event){
        const info = {};

        fetchProfile(event.data, DEFAULT_PROFILES_PATH, DEFAULT_PROFILE)
            .then(({profile, assetPath}) => {
                // console.log( JSON.stringify(profile));

                info.name = profile.profileId;
                info.targetRayMode = event.data.targetRayMode;

                Object.entries(profile.layouts).forEach(([key, layout]) => {
                    const components = {};
                    Object.values(layout.components).forEach((component) => {
                        components[component.rootNodeName] = component.gamepadIndices;
                    });
                    info[key] = components;
                });

                if (event.data.handedness === 'left') {
                    this.createButtonStates(info.left);
                } else {
                    this.createButtonStates(info.right);
                }

                // console.log( JSON.stringify(info) );
            });
    }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.stats.update()
    if (this.renderer.xr.isPresenting) {
      this.handleController(this.controller)
    }
    this.world.step(this.dt)
    this.helper.update()
    this.renderer.render(this.scene, this.camera)
  }
}

export {App}
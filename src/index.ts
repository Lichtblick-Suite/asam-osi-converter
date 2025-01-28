import {
  LineType,
  SceneUpdate,
  type Color,
  type FrameTransform,
  type KeyValuePair,
  type LinePrimitive,
  type Point3,
  type Quaternion,
  type Vector3,
} from "@foxglove/schemas";
import { Time } from "@foxglove/schemas/schemas/typescript/Time";
import {
  DetectedLaneBoundary,
  GroundTruth,
  LaneBoundary,
  LaneBoundary_BoundaryPoint,
  LaneBoundary_Classification_Type,
  MovingObject,
  MovingObject_Type,
  MovingObject_VehicleClassification,
  MovingObject_VehicleClassification_Type,
  SensorData,
  SensorView,
  StationaryObject,
  Timestamp,
  TrafficLight,
  TrafficSign,
  MovingObject_VehicleClassification_LightState_GenericLightState,
  MovingObject_VehicleClassification_LightState_BrakeLightState,
  MovingObject_VehicleClassification_LightState_IndicatorState,
} from "@lichtblick/asam-osi-types";
import { ExtensionContext } from "@lichtblick/suite";
import { eulerToQuaternion, pointRotationByQuaternion } from "@utils/geometry";
import { ColorCode } from "@utils/helper";
import {
  pointListToLinePrimitive,
  pointListToDashedLinePrimitive,
  objectToCubePrimitive,
} from "@utils/marker";
import { PartialSceneEntity } from "@utils/scene";
import { DeepPartial, DeepRequired } from "ts-essentials";

import {
  HOST_OBJECT_COLOR,
  LANE_BOUNDARY_COLOR,
  MOVING_OBJECT_COLOR,
  STATIONARY_OBJECT_COLOR,
  STATIONARY_OBJECT_TYPE,
  STATIONARY_OBJECT_MATERIAL,
  STATIONARY_OBJECT_DENSITY,
  TRAFFIC_LIGHT_COLOR,
} from "./config";
import { buildTrafficLightMetadata, buildTrafficLightModel } from "./trafficlights";
import { preloadDynamicTextures, buildTrafficSignModel } from "./trafficsigns";

const ROOT_FRAME = "<root>";

function buildObjectEntity(
  osiObject: DeepRequired<MovingObject> | DeepRequired<StationaryObject>,
  color: Color,
  id_prefix: string,
  frame_id: string,
  time: Time,
  metadata?: KeyValuePair[],
): PartialSceneEntity {
  const cube = objectToCubePrimitive(
    osiObject.base.position.x,
    osiObject.base.position.y,
    osiObject.base.position.z,
    osiObject.base.orientation.roll,
    osiObject.base.orientation.pitch,
    osiObject.base.orientation.yaw,
    osiObject.base.dimension.width,
    osiObject.base.dimension.length,
    osiObject.base.dimension.height,
    color,
  );

  return {
    timestamp: time,
    frame_id,
    id: id_prefix + osiObject.id.value.toString(),
    lifetime: { sec: 0, nsec: 0 },
    frame_locked: true,
    cubes: [cube],
    metadata,
  };
}

function buildTrafficSignEntity(
  obj: DeepRequired<TrafficSign>,
  id_prefix: string,
  frame_id: string,
  time: Time,
  metadata?: KeyValuePair[],
): PartialSceneEntity {
  const models = [];

  models.push(buildTrafficSignModel("main", obj.main_sign));

  if (obj.supplementary_sign.length > 0) {
    for (const item of obj.supplementary_sign) {
      models.push(buildTrafficSignModel("main", item));
    }
  }

  return {
    timestamp: time,
    frame_id,
    id: id_prefix + obj.id.value.toString(),
    lifetime: { sec: 0, nsec: 0 },
    frame_locked: true,
    // texts,
    models,
    metadata,
  };
}

function buildTrafficLightEntity(
  obj: DeepRequired<TrafficLight>,
  id_prefix: string,
  frame_id: string,
  time: Time,
  metadata?: KeyValuePair[],
): PartialSceneEntity {
  const models = [];

  models.push(buildTrafficLightModel(obj, TRAFFIC_LIGHT_COLOR[obj.classification.color].code));

  return {
    timestamp: time,
    frame_id,
    id: id_prefix + obj.id.value.toString(),
    lifetime: { sec: 0, nsec: 0 },
    frame_locked: true,
    // texts,
    models,
    metadata,
  };
}

function buildLaneBoundaryEntity(
  osiLaneBoundary: DeepRequired<LaneBoundary>,
  frame_id: string,
  time: Time,
): PartialSceneEntity {
  const color = LANE_BOUNDARY_COLOR[osiLaneBoundary.classification.type];
  let line: LinePrimitive;
  switch (osiLaneBoundary.classification.type) {
    case LaneBoundary_Classification_Type.DASHED_LINE:
      line = pointListToDashedLinePrimitive(
        osiLaneBoundary.boundary_line.map((point) => point.position as Vector3),
        1,
        2.5,
        osiLaneBoundary.boundary_line[0]?.width ?? 0,
        color,
      );
      break;
    case LaneBoundary_Classification_Type.BOTTS_DOTS:
      line = pointListToDashedLinePrimitive(
        osiLaneBoundary.boundary_line.map((point) => point.position as Vector3),
        0.1,
        1,
        osiLaneBoundary.boundary_line[0]?.width ?? 0,
        color,
      );
      break;
    default:
      line = pointListToLinePrimitive(
        osiLaneBoundary.boundary_line.map((point) => point.position as Vector3),
        osiLaneBoundary.boundary_line[0]?.width ?? 0,
        color,
      );
      break;
  }
  const metadata = buildLaneBoundaryMetadata(osiLaneBoundary);

  return {
    timestamp: time,
    frame_id,
    id: "boundary_" + osiLaneBoundary.id.value.toString(),
    lifetime: { sec: 0, nsec: 0 },
    frame_locked: true,
    lines: [line],
    metadata,
  };
}

interface IlightStateEnumStringMaps {
  generic_light_state: typeof MovingObject_VehicleClassification_LightState_GenericLightState;
  [key: string]: Record<number, string>;
}

const lightStateEnumStringMaps: IlightStateEnumStringMaps = {
  indicator_state: MovingObject_VehicleClassification_LightState_IndicatorState,
  brake_light_state: MovingObject_VehicleClassification_LightState_BrakeLightState,
  generic_light_state: MovingObject_VehicleClassification_LightState_GenericLightState,
};

export function buildVehicleMetadata(
  vehicle_classification: DeepRequired<MovingObject_VehicleClassification>,
): KeyValuePair[] {
  return [
    {
      key: "type",
      value: MovingObject_VehicleClassification_Type[vehicle_classification.type],
    },
    ...Object.entries(vehicle_classification.light_state ?? {}).map(([key, value]) => {
      return {
        key: `light_state.${key}`,
        value:
          lightStateEnumStringMaps[key]?.[value] ??
          lightStateEnumStringMaps.generic_light_state[value]!,
      };
    }),
  ];
}

export function buildLaneBoundaryMetadata(
  lane_boundary: DeepRequired<LaneBoundary>,
): KeyValuePair[] {
  const metadata: KeyValuePair[] = [
    {
      key: "type",
      value: LaneBoundary_Classification_Type[lane_boundary.classification.type],
    },
    {
      key: "width",
      value: lane_boundary.boundary_line[0]?.width!.toString() ?? "0",
    },
  ];

  return metadata;
}

export function buildStationaryMetadata(obj: DeepRequired<StationaryObject>): KeyValuePair[] {
  const metadata: KeyValuePair[] = [
    {
      key: "density",
      value: STATIONARY_OBJECT_DENSITY[obj.classification.density] || STATIONARY_OBJECT_DENSITY[0],
    },
    {
      key: "material",
      value:
        STATIONARY_OBJECT_MATERIAL[obj.classification.material] || STATIONARY_OBJECT_MATERIAL[0],
    },
    {
      key: "color",
      value:
        STATIONARY_OBJECT_COLOR[obj.classification.color].name || STATIONARY_OBJECT_COLOR[0].name,
    },
    {
      key: "type",
      value: STATIONARY_OBJECT_TYPE[obj.classification.type] || STATIONARY_OBJECT_TYPE[0],
    },
  ];

  return metadata;
}

function osiTimestampToTime(time: DeepRequired<Timestamp>): Time {
  return {
    sec: time.seconds,
    nsec: time.nanos,
  };
}

const staticObjectsRenderCache: {
  lastRenderTime: Time | undefined;
  lastRenderedObjects: Set<number>;
} = {
  lastRenderTime: undefined,
  lastRenderedObjects: new Set<number>(),
};

export function determineTheNeedToRerender(lastRenderTime: Time, currentRenderTime: Time): boolean {
  const diff =
    Number(currentRenderTime.sec) * 1000000000 +
    currentRenderTime.nsec -
    (Number(lastRenderTime.sec) * 1000000000 + lastRenderTime.nsec);
  return !(diff >= 0 && diff <= 10000000);
}

function buildSceneEntities(osiGroundTruth: DeepRequired<GroundTruth>): PartialSceneEntity[] {
  let sceneEntities: PartialSceneEntity[] = [];
  const time: Time = osiTimestampToTime(osiGroundTruth.timestamp);
  const needtoRerender =
    staticObjectsRenderCache.lastRenderTime != undefined &&
    determineTheNeedToRerender(staticObjectsRenderCache.lastRenderTime, time);

  // Moving objects
  const movingObjectSceneEntities = osiGroundTruth.moving_object.map((obj) => {
    let entity;
    if (obj.id.value === osiGroundTruth.host_vehicle_id?.value) {
      const metadata = buildVehicleMetadata(obj.vehicle_classification);
      entity = buildObjectEntity(obj, HOST_OBJECT_COLOR, "", ROOT_FRAME, time, metadata);
    } else {
      const objectType = MovingObject_Type[obj.type];
      const objectColor = MOVING_OBJECT_COLOR[obj.type];
      const prefix = `moving_object_${objectType}_`;
      const metadata =
        obj.type === MovingObject_Type.VEHICLE
          ? buildVehicleMetadata(obj.vehicle_classification)
          : [];
      entity = buildObjectEntity(obj, objectColor, prefix, ROOT_FRAME, time, metadata);
    }
    return entity;
  });

  sceneEntities = sceneEntities.concat(movingObjectSceneEntities);

  // Stationary objects
  const stationaryObjectSceneEntities = osiGroundTruth.stationary_object.map((obj) => {
    const objectColor = STATIONARY_OBJECT_COLOR[obj.classification.color].code;
    const metadata = buildStationaryMetadata(obj);
    return buildObjectEntity(obj, objectColor, "stationary_object_", ROOT_FRAME, time, metadata);
  });
  sceneEntities = sceneEntities.concat(stationaryObjectSceneEntities);

  // Traffic Sign objects
  let filteredTrafficSigns: DeepRequired<TrafficSign>[];
  if (needtoRerender) {
    staticObjectsRenderCache.lastRenderedObjects.clear();
    filteredTrafficSigns = osiGroundTruth.traffic_sign;
  } else {
    filteredTrafficSigns = osiGroundTruth.traffic_sign.filter((obj) => {
      return !staticObjectsRenderCache.lastRenderedObjects.has(obj.id.value);
    });
  }
  const trafficsignObjectSceneEntities = filteredTrafficSigns.map((obj) => {
    staticObjectsRenderCache.lastRenderedObjects.add(obj.id.value);
    return buildTrafficSignEntity(obj, "traffic_sign_", ROOT_FRAME, time);
  });
  staticObjectsRenderCache.lastRenderTime = time;
  sceneEntities = sceneEntities.concat(trafficsignObjectSceneEntities);

  // Traffic Light objects
  const trafficlightObjectSceneEntities = osiGroundTruth.traffic_light.map((obj) => {
    const metadata = buildTrafficLightMetadata(obj);
    return buildTrafficLightEntity(obj, "traffic_light_", ROOT_FRAME, time, metadata);
  });
  sceneEntities = sceneEntities.concat(trafficlightObjectSceneEntities);

  // Lane boundaries
  const laneBoundarySceneEntities = osiGroundTruth.lane_boundary.map((lane_boundary) => {
    return buildLaneBoundaryEntity(lane_boundary, ROOT_FRAME, time);
  });
  sceneEntities = sceneEntities.concat(laneBoundarySceneEntities);

  return sceneEntities;
}

export function frameTransformator(osiGroundTruth: DeepRequired<GroundTruth>): FrameTransform {
  const hostIdentifier = osiGroundTruth.host_vehicle_id.value;
  const hostObject = osiGroundTruth.moving_object.find((obj) => {
    return obj.id.value === hostIdentifier;
  })!;
  const rollAngle = hostObject.base.orientation.roll;
  const pitchAngle = hostObject.base.orientation.pitch;
  const yawAngle = -hostObject.base.orientation.yaw;
  const hostObjectBasePosition: Vector3 = {
    x: -hostObject.base.position.x,
    y: -hostObject.base.position.y,
    z: -hostObject.base.position.z,
  };
  const quaternion: Quaternion = eulerToQuaternion(rollAngle, pitchAngle, yawAngle);
  const translationResult = pointRotationByQuaternion(hostObjectBasePosition, quaternion);
  translationResult.x = translationResult.x - hostObject.vehicle_attributes.bbcenter_to_rear.x;
  translationResult.y = translationResult.y - hostObject.vehicle_attributes.bbcenter_to_rear.y;
  translationResult.z = 0;
  return {
    timestamp: osiTimestampToTime(osiGroundTruth.timestamp),
    parent_frame_id: "ego_vehicle_rear_axis",
    child_frame_id: "<root>",
    translation: translationResult,
    rotation: eulerToQuaternion(0, 0, yawAngle),
  };
}

function buildGroundTruthSceneEntities(
  osiSensorData: DeepRequired<SensorData>,
): PartialSceneEntity[] {
  const ToPoint3 = (boundary: DeepRequired<LaneBoundary_BoundaryPoint>): Point3 => {
    return { x: boundary.position.x, y: boundary.position.y, z: 0 };
  };
  const ToLinePrimitive = (points: Point3[], thickness: number): DeepPartial<LinePrimitive> => {
    return {
      type: LineType.LINE_STRIP,
      pose: {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: -10 },
      },
      thickness,
      scale_invariant: true,
      points,
      color: ColorCode("green", 1),
      indices: [],
    };
  };

  const makeLinePrimitive = (
    lane_boundary: DeepRequired<DetectedLaneBoundary>,
    thickness: number,
  ): DeepPartial<LinePrimitive> => {
    return ToLinePrimitive(lane_boundary.boundary_line.map(ToPoint3), thickness);
  };

  const makePrimitiveLines = (
    lane_boundary: DeepRequired<DetectedLaneBoundary>[],
    thickness: number,
  ): DeepPartial<LinePrimitive>[] => {
    return lane_boundary.map((b) => makeLinePrimitive(b, thickness));
  };

  const road_output_scene_update: PartialSceneEntity = {
    timestamp: { sec: osiSensorData.timestamp.seconds, nsec: osiSensorData.timestamp.nanos },
    frame_id: "ego_vehicle_rear_axis",
    id: "ra_ground_truth",
    lifetime: { sec: 0, nsec: 0 },
    frame_locked: true,
    lines: makePrimitiveLines(osiSensorData.lane_boundary, 1.0),
  };
  return [road_output_scene_update];
}

export function activate(extensionContext: ExtensionContext): void {
  preloadDynamicTextures();

  const convertGrountTruthToSceneUpdate = (
    osiGroundTruth: GroundTruth,
  ): DeepPartial<SceneUpdate> => {
    let sceneEntities: PartialSceneEntity[] = [];

    try {
      sceneEntities = buildSceneEntities(osiGroundTruth as DeepRequired<GroundTruth>);
    } catch (error) {
      console.error(
        "OsiGroundTruthVisualizer: Error during message conversion:\n%s\nSkipping message! (Input message not compatible?)",
        error,
      );
    }
    return {
      deletions: [],
      entities: sceneEntities,
    };
  };

  const convertSensorDataToSceneUpdate = (osiSensorData: SensorData): DeepPartial<SceneUpdate> => {
    let sceneEntities: PartialSceneEntity[] = [];

    try {
      sceneEntities = buildGroundTruthSceneEntities(osiSensorData as DeepRequired<SensorData>);
    } catch (error) {
      console.error(
        "OsiGroundTruthVisualizer: Error during message conversion:\n%s\nSkipping message! (Input message not compatible?)",
        error,
      );
    }
    return {
      deletions: [],
      entities: sceneEntities,
    };
  };

  const convertGrountTruthToFrameTransform = (message: GroundTruth): FrameTransform => {
    let transforms = {} as FrameTransform;
    try {
      if (message.host_vehicle_id) {
        transforms = frameTransformator(message as DeepRequired<GroundTruth>);
      }
    } catch (error) {
      console.error(
        "DetectionListForSensors: Error during FrameTransform message conversion:\n%s\nSkipping message! (Input message not compatible?)",
        error,
      );
    }
    return transforms;
  };

  extensionContext.registerMessageConverter({
    fromSchemaName: "osi3.GroundTruth",
    toSchemaName: "foxglove.SceneUpdate",
    converter: convertGrountTruthToSceneUpdate,
  });

  extensionContext.registerMessageConverter({
    fromSchemaName: "osi3.SensorView",
    toSchemaName: "foxglove.SceneUpdate",
    converter: (osiSensorView: SensorView) =>
      convertGrountTruthToSceneUpdate(osiSensorView.global_ground_truth!),
  });

  extensionContext.registerMessageConverter({
    fromSchemaName: "osi3.SensorData",
    toSchemaName: "foxglove.SceneUpdate",
    converter: convertSensorDataToSceneUpdate,
  });

  extensionContext.registerMessageConverter({
    fromSchemaName: "osi3.GroundTruth",
    toSchemaName: "foxglove.FrameTransform",
    converter: convertGrountTruthToFrameTransform,
  });

  extensionContext.registerMessageConverter({
    fromSchemaName: "osi3.SensorView",
    toSchemaName: "foxglove.FrameTransform",
    converter: (message: SensorView) =>
      convertGrountTruthToFrameTransform(message.global_ground_truth!),
  });
}

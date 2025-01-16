import {
  LinePrimitive,
  LineType,
  CubePrimitive,
  Color,
  Point3,
  Point2,
  ModelPrimitive,
  Vector3,
} from "@foxglove/schemas";

import { eulerToQuaternion } from "./geometry";

export interface ArrowProperties {
  shaft_diameter: number;
  shaft_length: number;
  head_diameter: number;
  head_length: number;
  color: Color;
}

export function pointListToLinePrimitive(
  points: Point2[],
  thickness: number,
  color: Color,
): LinePrimitive {
  return {
    type: LineType.LINE_STRIP,
    pose: {
      position: { x: 0, y: 0, z: 0 },
      orientation: eulerToQuaternion(0, 0, 0),
    },
    thickness,
    scale_invariant: false,
    points: points.map((p) => {
      return { x: p.x, y: p.y, z: 0.0 };
    }),
    color,
    colors: [],
    indices: [],
  };
}

export function pointListToDashedLinePrimitive(
  points: Vector3[],
  length_segment: number,
  length_gap: number,
  thickness: number,
  color: Color,
): LinePrimitive {
  const new_points: Point3[] = [];
  const new_colors: Color[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    // line p1 --> p2, vector: p2-p1, linear equation: x = p1 + t * (p2-p1)
    // distance: sqrt((p2.x - p1.x)^2 + (p2.y - p1.y)^2 + (p2.z - p1.z)^2)
    const distance = Math.sqrt(
      Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) + Math.pow(p2.z - p1.z, 2),
    );

    let current = 0;
    let segment = true;
    while (current < distance) {
      let t = current / distance;
      let pos_x = p1.x + t * (p2.x - p1.x);
      let pos_y = p1.y + t * (p2.y - p1.y);
      let pos_z = p1.z + t * (p2.z - p1.z);

      const point1 = { x: pos_x, y: pos_y, z: pos_z };

      if (segment) {
        current += length_segment;
      } else {
        current += length_gap;
      }

      t = current / distance;
      pos_x = p1.x + t * (p2.x - p1.x);
      pos_y = p1.y + t * (p2.y - p1.y);
      pos_z = p1.z + t * (p2.z - p1.z);

      let point2 = { x: pos_x, y: pos_y, z: pos_z };

      if (t > 1) {
        point2 = { x: p2.x, y: p2.y, z: p2.z };
      }

      // line from point1 to point2
      new_points.push(point1);
      new_points.push(point2);
      if (segment) {
        new_colors.push(color);
        new_colors.push(color);
      } else {
        new_colors.push({ r: 1, g: 1, b: 1, a: 0 });
        new_colors.push({ r: 1, g: 1, b: 1, a: 0 });
      }

      segment = !segment;
    }
  }

  return {
    type: LineType.LINE_STRIP,
    pose: {
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: -10 },
    },
    thickness,
    scale_invariant: false,
    points: new_points,
    color: { r: 0, g: 0, b: 0, a: 0 },
    colors: new_colors,
    indices: [],
  } as LinePrimitive;
}

export function objectToCubePrimitive(
  x: number,
  y: number,
  z: number,
  roll: number,
  pitch: number,
  yaw: number,
  x_reference_offset: number,
  y_reference_offset: number,
  width: number,
  length: number,
  height: number,
  color: Color,
): CubePrimitive {
  const sin_yaw = Math.sin(yaw);
  const cos_yaw = Math.cos(yaw);

  // rotate
  const processed_x = x + cos_yaw * x_reference_offset - sin_yaw * y_reference_offset;
  const processed_y = y + sin_yaw * x_reference_offset + cos_yaw * y_reference_offset;
  const processed_z = z + height / 2.0;

  return {
    pose: {
      position: {
        x: processed_x,
        y: processed_y,
        z: processed_z,
      },
      orientation: eulerToQuaternion(roll, pitch, yaw),
    },
    size: {
      x: length,
      y: width,
      z: height,
    },
    color,
  };
}

export function objectToModelPrimitive(
  x: number,
  y: number,
  z: number,
  theta: number,
  x_reference_offset: number,
  y_reference_offset: number,
  width: number,
  length: number,
  height: number,
  color: Color,
  data: Uint8Array,
): ModelPrimitive {
  const sin_theta = Math.sin(theta);
  const cos_theta = Math.cos(theta);

  // rotate
  const processed_x = x + cos_theta * x_reference_offset - sin_theta * y_reference_offset;
  const processed_y = y + sin_theta * x_reference_offset + cos_theta * y_reference_offset;

  return {
    pose: {
      position: {
        x: processed_x,
        y: processed_y,
        z,
      },
      orientation: eulerToQuaternion(0, 0, theta + Math.PI),
    },
    scale: {
      x: length,
      y: width,
      z: height,
    },
    color,
    override_color: false,
    url: "",
    media_type: "model/gltf-binary",
    data,
  };
}

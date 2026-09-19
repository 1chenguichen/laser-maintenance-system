import { Injectable } from '@nestjs/common';

@Injectable()
export class AmapService {
  private readonly apiKey = process.env.AMAP_API_KEY || '';

  /**
   * 地理编码：将地址转换为经纬度
   */
  async geocode(address: string): Promise<{ lat: number; lng: number } | null> {
    if (!this.apiKey) {
      // 无 API Key 时返回模拟数据
      return { lat: 39.9042 + Math.random() * 0.1, lng: 116.4074 + Math.random() * 0.1 };
    }

    try {
      const url = `https://restapi.amap.com/v3/geocode/geo?key=${this.apiKey}&address=${encodeURIComponent(address)}`;
      const response = await fetch(url);
      const data = await response.json() as any;

      if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
        const location = data.geocodes[0].location.split(',');
        return { lng: parseFloat(location[0]), lat: parseFloat(location[1]) };
      }
      return null;
    } catch (error) {
      console.error('Geocode error:', error);
      return null;
    }
  }

  /**
   * 逆地理编码：将经纬度转换为地址
   */
  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    if (!this.apiKey) {
      return '北京市海淀区';
    }

    try {
      const url = `https://restapi.amap.com/v3/geocode/regeo?key=${this.apiKey}&location=${lng},${lat}`;
      const response = await fetch(url);
      const data = await response.json() as any;

      if (data.status === '1' && data.regeocode) {
        return data.regeocode.formatted_address;
      }
      return null;
    } catch (error) {
      console.error('Reverse geocode error:', error);
      return null;
    }
  }

  /**
   * 距离计算：计算两点之间的距离（米）
   */
  async distance(lat1: number, lng1: number, lat2: number, lng2: number): Promise<number> {
    if (!this.apiKey) {
      // Haversine 公式计算
      const R = 6371000; // 地球半径（米）
      const dLat = this.toRad(lat2 - lat1);
      const dLng = this.toRad(lng2 - lng1);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return Math.round(R * c);
    }

    try {
      const url = `https://restapi.amap.com/v3/distance?key=${this.apiKey}&origins=${lng1},${lat1}&destination=${lng2},${lat2}&type=1`;
      const response = await fetch(url);
      const data = await response.json() as any;

      if (data.status === '1' && data.results && data.results.length > 0) {
        return parseInt(data.results[0].distance);
      }
      return -1;
    } catch (error) {
      console.error('Distance error:', error);
      return -1;
    }
  }

  /**
   * 路线规划：获取驾驶路线
   */
  async drivingRoute(lat1: number, lng1: number, lat2: number, lng2: number): Promise<any> {
    if (!this.apiKey) {
      return {
        distance: 5000,
        duration: 1200,
        strategy: '速度优先',
      };
    }

    try {
      const url = `https://restapi.amap.com/v3/direction/driving?key=${this.apiKey}&origin=${lng1},${lat1}&destination=${lng2},${lat2}&strategy=0`;
      const response = await fetch(url);
      const data = await response.json() as any;

      if (data.status === '1' && data.route) {
        const path = data.route.paths[0];
        return {
          distance: parseInt(path.distance),
          duration: parseInt(path.duration),
          strategy: '速度优先',
        };
      }
      return null;
    } catch (error) {
      console.error('Driving route error:', error);
      return null;
    }
  }

  /**
   * 坐标转换：高德坐标转其他坐标
   */
  async convertCoord(lat: number, lng: number, from: 'gps' | 'mapbar' | 'baidu' = 'gps'): Promise<{ lat: number; lng: number }> {
    if (from === 'gps') {
      // GPS 坐标转高德坐标
      if (!this.apiKey) {
        return { lat, lng };
      }
      try {
        const url = `https://restapi.amap.com/v3/assistant/coordinate/convert?key=${this.apiKey}&coordsys=gps&locations=${lng},${lat}`;
        const response = await fetch(url);
        const data = await response.json() as any;
        if (data.status === '1' && data.locations) {
          const parts = data.locations.split(',');
          return { lng: parseFloat(parts[0]), lat: parseFloat(parts[1]) };
        }
      } catch (error) {
        console.error('Coord convert error:', error);
      }
    }
    return { lat, lng };
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

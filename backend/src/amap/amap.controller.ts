import { Controller, Get, Query } from '@nestjs/common';
import { AmapService } from './amap.service.js';

@Controller('amap')
export class AmapController {
  constructor(private amapService: AmapService) {}

  @Get('geocode')
  async geocode(@Query('address') address: string) {
    if (!address) {
      return { error: '地址不能为空' };
    }
    const result = await this.amapService.geocode(address);
    if (!result) {
      return { error: '地理编码失败' };
    }
    return result;
  }

  @Get('reverse')
  async reverseGeocode(@Query('lat') lat: string, @Query('lng') lng: string) {
    if (!lat || !lng) {
      return { error: '坐标不能为空' };
    }
    const result = await this.amapService.reverseGeocode(parseFloat(lat), parseFloat(lng));
    if (!result) {
      return { error: '逆地理编码失败' };
    }
    return { address: result };
  }

  @Get('distance')
  async distance(
    @Query('lat1') lat1: string,
    @Query('lng1') lng1: string,
    @Query('lat2') lat2: string,
    @Query('lng2') lng2: string,
  ) {
    if (!lat1 || !lng1 || !lat2 || !lng2) {
      return { error: '坐标参数不完整' };
    }
    const dist = await this.amapService.distance(
      parseFloat(lat1), parseFloat(lng1),
      parseFloat(lat2), parseFloat(lng2),
    );
    return { distance: dist };
  }

  @Get('route')
  async drivingRoute(
    @Query('lat1') lat1: string,
    @Query('lng1') lng1: string,
    @Query('lat2') lat2: string,
    @Query('lng2') lng2: string,
  ) {
    if (!lat1 || !lng1 || !lat2 || !lng2) {
      return { error: '坐标参数不完整' };
    }
    const route = await this.amapService.drivingRoute(
      parseFloat(lat1), parseFloat(lng1),
      parseFloat(lat2), parseFloat(lng2),
    );
    if (!route) {
      return { error: '路线规划失败' };
    }
    return route;
  }
}

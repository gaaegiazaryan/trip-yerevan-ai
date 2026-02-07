import { Controller, Get, Param, Query } from '@nestjs/common';
import { TravelRequestsService } from './travel-requests.service';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('travel-requests')
export class TravelRequestsController {
  constructor(
    private readonly travelRequestsService: TravelRequestsService,
  ) {}

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.travelRequestsService.findById(id);
  }

  @Get('user/:userId')
  async findByUserId(
    @Param('userId') userId: string,
    @Query() _pagination: PaginationDto,
  ) {
    return this.travelRequestsService.findByUserId(userId);
  }
}

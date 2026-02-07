import { Controller, Get, Param } from '@nestjs/common';
import { OffersService } from './offers.service';

@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.offersService.findById(id);
  }

  @Get('travel-request/:travelRequestId')
  async findByTravelRequestId(
    @Param('travelRequestId') travelRequestId: string,
  ) {
    return this.offersService.findByTravelRequestId(travelRequestId);
  }
}

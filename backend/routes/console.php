<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('drive:cleanup')->hourly()->withoutOverlapping();
